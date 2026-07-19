package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.time.Instant;
import java.time.LocalDate;

/** One expense entry inside a derived group, with the group's running spend. */
public record DerivedStatementRowResponse(
        String transactionId,
        LocalDate date,
        Instant occurredAt,
        double amount,
        double runningTotal
)
{
}
