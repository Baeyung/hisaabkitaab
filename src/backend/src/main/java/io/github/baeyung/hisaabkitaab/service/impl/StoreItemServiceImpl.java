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
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreItemServiceImpl implements StoreItemService
{
    private final StoreItemRepository storeItemRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;
    private final StoreService storeService;

    @Override
    @Transactional(readOnly = true)
    public StoreItem findEntity(String id)
    {
        return storeItemRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("StoreItem", id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<StoreItem> findByOwner(String ownerId)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        return storeItemRepository.findByStoreId(store.getId());
    }

    @Override
    @Transactional(readOnly = true)
    public StoreItem findByIdForOwner(String id, String ownerId)
    {
        // An item in another owner's store is reported as not-found so we never leak its existence.
        return storeItemRepository.findById(id)
                .filter(item -> item.getStore().getOwner().getId().equals(ownerId))
                .orElseThrow(() -> ResourceNotFoundException.forEntity("StoreItem", id));
    }

    @Override
    public StoreItem create(StoreItem input, String ownerId)
    {
        StoreItem item = StoreItem.builder()
                .store(storeService.getPrimaryStoreForOwner(ownerId))
                .name(input.getName())
                .unit(input.getUnit())
                .salePrice(input.getSalePrice())
                .costPrice(input.getCostPrice())
                .build();

        return storeItemRepository.save(item);
    }

    @Override
    public StoreItem update(String id, StoreItem changes, String ownerId)
    {
        StoreItem item = findByIdForOwner(id, ownerId);

        item.setName(changes.getName());
        item.setUnit(changes.getUnit());
        item.setSalePrice(changes.getSalePrice());
        item.setCostPrice(changes.getCostPrice());

        return storeItemRepository.save(item);
    }

    @Override
    public void delete(String id, String ownerId)
    {
        StoreItem item = findByIdForOwner(id, ownerId);

        // Cascade: delete every transaction that used this item (their lines go via orphanRemoval).
        List<Transaction> transactions = transactionLineRepository.findByItemId(id).stream()
                .map(TransactionLine::getTransaction)
                .distinct()
                .toList();
        transactionRepository.deleteAll(transactions);

        storeItemRepository.delete(item);
    }
}
