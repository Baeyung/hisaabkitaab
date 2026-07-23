package io.github.baeyung.hisaabkitaab.dto.cashbook;

import java.time.Instant;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

public record CashbookRowResponse(
        String transactionId,
        Instant occurredAt,
        TransactionEvent event,
        String description,
        /** Goods on the entry ("Lawn Print × 12") — null when it moves none. */
        String itemSummary,
        String partyName,
        InOut inOut,
        double amount,
        double runningBalance
)
{
}
