package io.github.baeyung.hisaabkitaab.service.impl;

import java.math.BigDecimal;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import io.github.baeyung.hisaabkitaab.service.UnitService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreItemServiceImpl implements StoreItemService
{
    private static final Logger log = LoggerFactory.getLogger(StoreItemServiceImpl.class);

    private final StoreItemRepository storeItemRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;
    private final UnitService unitService;

    @Override
    @Transactional(readOnly = true)
    public StoreItem findEntity(String id)
    {
        return storeItemRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("StoreItem", id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<StoreItem> findByStore(String storeId)
    {
        return storeItemRepository.findByStoreId(storeId);
    }

    @Override
    @Transactional(readOnly = true)
    public StoreItem findByIdForStore(String id, String storeId)
    {
        // An item in another store is reported as not-found so we never leak its existence.
        return storeItemRepository.findById(id)
                .filter(item -> item.getStore().getId().equals(storeId))
                .orElseThrow(() -> ResourceNotFoundException.forEntity("StoreItem", id));
    }

    @Override
    public StoreItem create(StoreItem input, Store store)
    {
        StoreItem item = StoreItem.builder()
                .store(store)
                .name(input.getName())
                .unit(input.getUnit())
                .salePrice(input.getSalePrice())
                .costPrice(input.getCostPrice())
                .service(input.isService())
                .build();

        StoreItem saved = storeItemRepository.save(item);
        unitService.resolveOrCreate(store, saved.getUnit());
        log.info("created item {} \"{}\" ({}) in store {}",
                saved.getId(), saved.getName(), saved.getUnit(), store.getId());
        return saved;
    }

    @Override
    public StoreItem create(StoreItem input)
    {
        return storeItemRepository.save(input);
    }

    @Override
    public StoreItem resolveOrCreate(String itemId, String name, String unit, Store store)
    {
        if (StringUtils.hasText(itemId))
        {
            return findByIdForStore(itemId, store.getId());
        }

        // Same reasoning as PartyServiceImpl.resolveOrCreate: an item born inside an entry
        // rather than on the items page is where an unexplained duplicate comes from.
        log.info("no item id on the entry, creating \"{}\" ({}) in store {}", name, unit, store.getId());

        unitService.resolveOrCreate(store, unit);
        return storeItemRepository.save(StoreItem.builder()
                .store(store)
                .name(name)
                .unit(unit)
                .salePrice(BigDecimal.ZERO)
                .costPrice(BigDecimal.ZERO)
                .build());
    }

    @Override
    public StoreItem update(String id, StoreItem changes, String storeId)
    {
        StoreItem item = findByIdForStore(id, storeId);

        log.info("updating item {} \"{}\" in store {}: name \"{}\", unit {}, sale {}, cost {}",
                id, item.getName(), storeId, changes.getName(), changes.getUnit(),
                changes.getSalePrice(), changes.getCostPrice());

        item.setName(changes.getName());
        item.setUnit(changes.getUnit());
        item.setSalePrice(changes.getSalePrice());
        item.setCostPrice(changes.getCostPrice());
        item.setService(changes.isService());

        unitService.resolveOrCreate(item.getStore(), item.getUnit());
        return storeItemRepository.save(item);
    }

    @Override
    public void delete(String id, String storeId)
    {
        StoreItem item = findByIdForStore(id, storeId);
        long startedAt = System.nanoTime();

        // Cascade: delete every transaction that used this item (their lines go via orphanRemoval).
        List<Transaction> transactions = transactionLineRepository.findByItemId(id).stream()
                .map(TransactionLine::getTransaction)
                .distinct()
                .toList();

        // Logged before the work and with the count, for the reason given at
        // PartyServiceImpl.delete: the cost is unbounded in the data, so a slow delete has to
        // be tellable from a stuck one.
        log.info("deleting item {} \"{}\" from store {}, cascading {} transaction(s)",
                id, item.getName(), storeId, transactions.size());

        transactionRepository.deleteAll(transactions);
        storeItemRepository.delete(item);

        log.info("deleted item {} and its {} transaction(s) in {}ms",
                id, transactions.size(), (System.nanoTime() - startedAt) / 1_000_000);
    }
}
