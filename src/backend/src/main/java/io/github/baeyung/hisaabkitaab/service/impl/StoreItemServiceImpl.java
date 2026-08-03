package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreItemServiceImpl implements StoreItemService
{
    private final StoreItemRepository storeItemRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;

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
                .build();

        return storeItemRepository.save(item);
    }

    @Override
    public StoreItem create(StoreItem input)
    {
        return storeItemRepository.save(input);
    }

    @Override
    public StoreItem update(String id, StoreItem changes, String storeId)
    {
        StoreItem item = findByIdForStore(id, storeId);

        item.setName(changes.getName());
        item.setUnit(changes.getUnit());
        item.setSalePrice(changes.getSalePrice());
        item.setCostPrice(changes.getCostPrice());

        return storeItemRepository.save(item);
    }

    @Override
    public void delete(String id, String storeId)
    {
        StoreItem item = findByIdForStore(id, storeId);

        // Cascade: delete every transaction that used this item (their lines go via orphanRemoval).
        List<Transaction> transactions = transactionLineRepository.findByItemId(id).stream()
                .map(TransactionLine::getTransaction)
                .distinct()
                .toList();
        transactionRepository.deleteAll(transactions);

        storeItemRepository.delete(item);
    }
}
