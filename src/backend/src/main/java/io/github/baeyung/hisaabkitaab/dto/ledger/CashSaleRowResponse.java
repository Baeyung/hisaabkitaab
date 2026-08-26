package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.time.Instant;
import java.time.LocalDate;

/** One walk-in sale — cash only, no party — with the register's running total. */
public record CashSaleRowResponse(
        String transactionId,
        LocalDate date,
        Instant occurredAt,
        String itemSummary,
        String description,
        double amount,
        double runningTotal
)
{
}
