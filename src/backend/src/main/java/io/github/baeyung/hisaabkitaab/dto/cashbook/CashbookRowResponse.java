package io.github.baeyung.hisaabkitaab.dto.cashbook;

import java.time.Instant;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

public record CashbookRowResponse(
        String transactionId,
        Instant occurredAt,
        TransactionEvent event,
        String description,
        String partyName,
        InOut inOut,
        double amount,
        double runningBalance
)
{
}
