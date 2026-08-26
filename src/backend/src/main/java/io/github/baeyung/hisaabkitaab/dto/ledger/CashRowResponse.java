package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.time.Instant;
import java.time.LocalDate;

/** One cash line — a walk-in sale or purchase, no party — with the register's running total. */
public record CashRowResponse(
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
