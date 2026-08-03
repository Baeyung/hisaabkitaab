package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.Store;

public interface StoreService
{
    List<Store> findByOwner(String ownerId);

    /**
     * Load a store, 404-ing if it does not exist or is not owned by {@code ownerId}. Every
     * store-scoped request enters through here (see {@code CurrentStoreArgumentResolver}),
     * which is what lets everything downstream scope on the store id alone.
     */
    Store findByIdForOwner(String id, String ownerId);

    Store create(Store store, String ownerId);

    Store update(String id, Store changes, String ownerId);

    /** Cascade-deletes the store's transactions, items, and parties, then the store itself. */
    void delete(String id, String ownerId);
}
