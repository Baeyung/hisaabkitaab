package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.time.Instant;
import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

public record PartyStatementRowResponse(
        String transactionId,
        LocalDate date,
        Instant occurredAt,
        TransactionEvent event,
        String description,
        String itemSummary,
        InOut inOut,
        double amount,
        PartyBalance runningBalance,
        Boolean cleared
)
{
}
