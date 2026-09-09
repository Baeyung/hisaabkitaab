package io.github.baeyung.hisaabkitaab.service;

import java.math.BigDecimal;
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

    /** Persist an already-resolved item. The entry screens run outside a transaction of their
     *  own, so a field changed on one has to be written back rather than left to dirty checking. */
    StoreItem save(StoreItem item);

    /**
     * The item an entry line names: an existing one by id, or a new catalogue entry created
     * from the typed name at zero prices, in {@code unit} — or, when the line named none, in
     * whichever unit the shop has marked default (see {@code UnitService#setDefault}). The id
     * arrives from the client, so it is checked against {@code store} — without that, a line
     * could name another shop's item, and since the movement history is queried by item alone
     * the line would surface in <em>their</em> stock. Reported as not-found so we never leak
     * whether the id exists.
     */
    StoreItem resolveOrCreate(String itemId, String name, String unit, Store store);

    /** This item's net stock in this store — Σ IN − Σ OUT over its whole STOCK-line history,
     *  which is what a weighted-average cost weights the old price against. */
    BigDecimal stockOnHand(String itemId, String storeId);

    /**
     * Fold goods arriving at {@code unitCost} into the item's price list at a weighted average
     * over what was already on the shelf, so a cheap lot on top of an expensive one lands
     * between the two rather than erasing the older figure. Used by a PURCHASE and by the
     * output of a PROCESSING batch, which are the two ways stock arrives priced.
     */
    StoreItem reprice(StoreItem item, BigDecimal stockBefore, BigDecimal quantity,
            BigDecimal unitCost, boolean moveSalePrice);

    StoreItem update(String id, StoreItem changes, String storeId);

    /** Cascade-deletes transactions that reference this item, then the item itself. */
    void delete(String id, String storeId);
}
