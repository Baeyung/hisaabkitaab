package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.time.Instant;
import java.time.LocalDate;

/** One expense entry inside a category group, with the category's running spend. */
public record ExpenseCategoryRowResponse(
        String transactionId,
        LocalDate date,
        Instant occurredAt,
        String description,
        double amount,
        double runningTotal
)
{
}
