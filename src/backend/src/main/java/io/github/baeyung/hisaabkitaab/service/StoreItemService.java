package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;

public interface StoreItemService
{
    StoreItem findEntity(String id);

    List<StoreItem> findByStore(String storeId);

    /** Load an item, 404-ing if it does not exist or does not belong to {@code storeId}. */
    StoreItem findByIdForStore(String id, String storeId);

    StoreItem create(StoreItem item, Store store);
    StoreItem create(StoreItem item);

    StoreItem update(String id, StoreItem changes, String storeId);

    /** Cascade-deletes transactions that reference this item, then the item itself. */
    void delete(String id, String storeId);
}
