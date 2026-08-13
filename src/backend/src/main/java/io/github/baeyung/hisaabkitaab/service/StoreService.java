package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.store.StoreSummary;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.models.StoreSettings;

/**
 * Stores are handed back as {@link StoreSummary}, never as the entity: the summary carries
 * the owner's name, which is a lazy association and would blow up once the entity is detached.
 * Methods taking a bare {@code storeId} are the ones called after {@code @CurrentStore} has
 * already vetted access — they re-check nothing, by design.
 */
public interface StoreService
{
    /** Every store the user can reach — the ones they own and the ones shared with them. */
    List<StoreSummary> listForUser(String userId);

    /**
     * Load a store, 404-ing if it does not exist or the user has no access to it, 403-ing if
     * their role is weaker than {@code required}. Every store-scoped request enters through
     * here (see {@code CurrentStoreArgumentResolver}), which is what lets everything
     * downstream scope on the store id alone.
     */
    Store findByIdForUser(String id, String userId, StoreRole required);

    /** One store as {@code userId} sees it, role included. */
    StoreSummary summaryOf(String storeId, String userId);

    StoreSummary create(Store store, String ownerId);

    StoreSummary update(String storeId, Store changes);

    /**
     * Replace how the shop is arranged — the whole document, not a patch. The client holds
     * the complete arrangement (it has to, to draw the menu) and sends it back, so there is
     * nothing here to merge and no way for two half-updates to disagree.
     */
    StoreSummary updateSettings(String storeId, StoreSettings settings);

    /**
     * Cascade-deletes the store's transactions, items, parties and shared access, then the
     * store itself.
     */
    void delete(String storeId);
}
