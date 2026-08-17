package io.github.baeyung.hisaabkitaab.dto.report;

import io.github.baeyung.hisaabkitaab.entity.Store;

/**
 * The shop as its own letterhead — what the report page prints at the top of the first sheet.
 *
 * <p>Deliberately not {@code StoreSummary}. That carries the caller's role and the shop's whole
 * menu arrangement, neither of which a printout has any use for, and this is served on an open
 * endpoint: what the report needs is a name, an address and a number to be reached on, so that
 * is all that goes out.
 */
public record ReportStore(
        String id,
        String name,
        String address,
        String contact,
        String logoUri,
        String watermarkUri)
{
    public static ReportStore of(Store store)
    {
        return new ReportStore(
                store.getId(),
                store.getName(),
                store.getAddress(),
                store.getContact(),
                store.getLogoUri(),
                store.getWatermarkUri());
    }
}
