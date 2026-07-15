package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.Store;

public interface StoreService
{
    Store findFirstByOwnerIdentifier(String identifier);

    /** The primary store for an owner (first one found); throws 404 if the owner has none. */
    Store getPrimaryStoreForOwner(String ownerId);

    List<Store> findByOwner(String ownerId);

    /** Load a store, 404-ing if it does not exist or is not owned by {@code ownerId}. */
    Store findByIdForOwner(String id, String ownerId);

    Store create(Store store, String ownerId);

    Store update(String id, Store changes, String ownerId);

    /** Cascade-deletes the store's transactions, items, and parties, then the store itself. */
    void delete(String id, String ownerId);
}
