package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreServiceImpl implements StoreService
{
    private final StoreRepository storeRepository;
    private final StoreItemRepository storeItemRepository;
    private final PartyRepository partyRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final ExpenseCategoryService expenseCategoryService;

    @Transactional
    @Override
    public Store findFirstByOwnerIdentifier(String identifier)
    {
        // A user can log in with either their email or contact number, so try both.
        return storeRepository.findAllByOwnerEmail(identifier).stream().findFirst()
                .or(() -> storeRepository.findAllByOwnerContactNumber(identifier).stream().findFirst())
                .or(() -> storeRepository.findByOwnerId(identifier).stream().findFirst())
                .orElse(null);
    }

    @Override
    @Transactional(readOnly = true)
    public Store getPrimaryStoreForOwner(String ownerId)
    {
        return storeRepository.findByOwnerId(ownerId).stream().findFirst()
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store for owner", ownerId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<Store> findByOwner(String ownerId)
    {
        return storeRepository.findByOwnerId(ownerId);
    }

    @Override
    @Transactional(readOnly = true)
    public Store findByIdForOwner(String id, String ownerId)
    {
        // A store owned by someone else is reported as not-found so we never leak its existence.
        return storeRepository.findById(id)
                .filter(store -> store.getOwner().getId().equals(ownerId))
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store", id));
    }

    @Override
    public Store create(Store input, String ownerId)
    {
        Store store = Store.builder()
                .owner(userRepository.getReferenceById(ownerId))
                .name(input.getName())
                .address(input.getAddress())
                .contact(input.getContact())
                .logoUri(input.getLogoUri())
                .watermarkUri(input.getWatermarkUri())
                .build();

        Store saved = storeRepository.save(store);
        expenseCategoryService.seedDefaults(saved);
        return saved;
    }

    @Override
    public Store update(String id, Store changes, String ownerId)
    {
        Store store = findByIdForOwner(id, ownerId);

        store.setName(changes.getName());
        store.setAddress(changes.getAddress());
        store.setContact(changes.getContact());
        store.setLogoUri(changes.getLogoUri());
        store.setWatermarkUri(changes.getWatermarkUri());

        return storeRepository.save(store);
    }

    @Override
    public void delete(String id, String ownerId)
    {
        Store store = findByIdForOwner(id, ownerId);

        // Cascade: transactions first (their lines are removed via orphanRemoval), which clears the
        // references from items and parties, then the items and parties, then the store itself.
        transactionRepository.deleteAll(transactionRepository.findByStoreId(id));
        storeItemRepository.deleteAll(storeItemRepository.findByStoreId(id));
        partyRepository.deleteAll(partyRepository.findByStoreId(id));
        storeRepository.delete(store);
    }
}
