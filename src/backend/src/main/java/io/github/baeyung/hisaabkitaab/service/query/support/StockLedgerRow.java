package io.github.baeyung.hisaabkitaab.service.query.support;

import java.math.BigDecimal;
import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

/**
 * One STOCK line flattened to what the cost replay reads off it.
 *
 * <p>A record rather than a Spring Data interface projection, for the reason
 * {@link PartyLedgerRow} gives: the replay walks a shop's whole goods history — every purchase,
 * sale, opening count and job-work batch since the shop opened — and a proxy per row puts every
 * field read on that walk through reflection.
 *
 * <p>Two of these fields are here only because they live on a different table and the walk cannot
 * go back for them per row: {@code discount} is the bill's, spread pro-rata across its goods lines,
 * and {@code costPrice} is the catalogue item's, which is the only cost an opening-stock line has
 * (it carries a count, not a rate). See {@link CostReplay}.
 */
public record StockLedgerRow(
        String itemId,
        String itemName,
        String unit,
        InOut inOut,
        BigDecimal quantity,
        Double itemSoldAt,
        LocalDate businessDate,
        TransactionEvent event,
        String transactionId,
        Double discount,
        BigDecimal costPrice
)
{
}
