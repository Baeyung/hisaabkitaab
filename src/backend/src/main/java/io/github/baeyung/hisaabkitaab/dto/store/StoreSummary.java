package io.github.baeyung.hisaabkitaab.dto.store;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.models.StoreSettings;

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
 * @param settings  how the owner has arranged the app for this shop. Sent to everyone, not
 *                  just the owner who set it: it is the shop's menu, and a member seeing a
 *                  different one than the person who arranged it would defeat the point.
 *                  Never null — a shop that has never been arranged sends the empty
 *                  arrangement rather than nothing, so the client has one shape to read.
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
        boolean suspended,
        StoreSettings settings)
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
                store.isSuspended(),
                // Null covers both a shop nobody has arranged and a row the converter could
                // not read. The single place either becomes "the built-in menu".
                store.getSettings() != null ? store.getSettings() : StoreSettings.EMPTY);
    }
}
