package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.StoreItem;

public interface StoreItemService
{
    StoreItem findEntity(String id);

    /** Items belonging to the owner's primary store. */
    List<StoreItem> findByOwner(String ownerId);

    /** Load an item, 404-ing if it does not exist or is not in a store owned by {@code ownerId}. */
    StoreItem findByIdForOwner(String id, String ownerId);

    StoreItem create(StoreItem item, String ownerId);
    StoreItem create(StoreItem item);

    StoreItem update(String id, StoreItem changes, String ownerId);

    /** Cascade-deletes transactions that reference this item, then the item itself. */
    void delete(String id, String ownerId);
}
