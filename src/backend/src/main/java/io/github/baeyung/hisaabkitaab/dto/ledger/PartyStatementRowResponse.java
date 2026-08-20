package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.time.Instant;
import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

/**
 * One entry on a party's khata, as the three figures that explain each other: what the
 * goods came to, what cash changed hands, and what the difference left on the khata.
 * {@code amount} is that last one — the only figure the row used to carry, which read as
 * neither the bill nor the payment on any entry that was part-paid.
 */
public record PartyStatementRowResponse(
        String transactionId,
        LocalDate date,
        Instant occurredAt,
        TransactionEvent event,
        String description,
        String itemSummary,
        InOut inOut,
        /** What this entry did to the khata: {@code goodsTotal} − {@code cashAmount}, unsigned, with {@link #inOut} for the direction. */
        double amount,
        /** What the entry's goods came to — the bill it stands for. Null on an entry that is not a document. */
        Double goodsTotal,
        /** Cash that changed hands on the entry. Null when none did — an opening balance moves no money. */
        Double cashAmount,
        PartyBalance runningBalance,
        Boolean cleared
)
{
}
