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
 * @param suspended true when the owner's plan no longer covers this shop, so it is readable
 *                  but closed to new entries. Sent for shared stores too — a member of a
 *                  closed shop meets the same read-only shop the owner does, and finding out
 *                  by having a save refused would be the wrong way round.
 */
public record StoreSummary(
        String id,
        String name,
        String address,
        String contact,
        String logoUri,
        String watermarkUri,
        StoreRole role,
        String ownerName,
        boolean suspended)
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
                store.getOwner().getName(),
                store.isSuspended());
    }
}
