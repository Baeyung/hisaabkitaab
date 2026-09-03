package io.github.baeyung.hisaabkitaab.service.query.support;

import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.enums.InOut;

/**
 * One PARTY line flattened to what receivable aging reads off it.
 *
 * <p>A record rather than a Spring Data interface projection on purpose. The aging walk covers
 * a whole shop's khata history — tens of thousands of lines for a shop a few years in — and an
 * interface projection hands back a dynamic proxy per row, so every field read on that walk goes
 * through reflection. Hibernate builds these directly from the result set instead.
 */
public record PartyLedgerRow(
        String partyId,
        String partyName,
        InOut inOut,
        Double value,
        LocalDate businessDate
)
{
}
