package io.github.baeyung.hisaabkitaab.dto.store;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;

/**
 * A store as the caller sees it: its own fields, plus what <em>this</em> caller may do in it
 * and whose shop it is. Every store-returning endpoint answers with this, so the client never
 * holds a store without knowing its role — which is what lets it hide the controls the
 * backend would refuse anyway.
 *
 * @param ownerName the owner's name, shown on shared stores ("Shared by …"). Their own name
 *                  for a store the caller owns, which the client simply doesn't display.
 */
public record StoreSummary(
        String id,
        String name,
        String address,
        String contact,
        String logoUri,
        String watermarkUri,
        StoreRole role,
        String ownerName)
{
    public static StoreSummary of(Store store, StoreRole role)
    {
        return new StoreSummary(
                store.getId(),
                store.getName(),
                store.getAddress(),
                store.getContact(),
                store.getLogoUri(),
                store.getWatermarkUri(),
                role,
                store.getOwner().getName());
    }
}
