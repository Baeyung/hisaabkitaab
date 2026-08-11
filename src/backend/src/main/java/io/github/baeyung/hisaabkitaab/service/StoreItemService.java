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

    /**
     * The item an entry line names: an existing one by id, or a new catalogue entry created
     * from the typed name at zero prices. The id arrives from the client, so it is checked
     * against {@code store} — without that, a line could name another shop's item, and since
     * the movement history is queried by item alone the line would surface in <em>their</em>
     * stock. Reported as not-found so we never leak whether the id exists.
     */
    StoreItem resolveOrCreate(String itemId, String name, String unit, Store store);

    StoreItem update(String id, StoreItem changes, String storeId);

    /** Cascade-deletes transactions that reference this item, then the item itself. */
    void delete(String id, String storeId);
}
