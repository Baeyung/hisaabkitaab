package io.github.baeyung.hisaabkitaab.dto.inventory;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

public record ItemMovementRowResponse(
        String transactionId,
        LocalDate date,
        Instant occurredAt,
        TransactionEvent event,
        String description,
        InOut inOut,
        BigDecimal quantity,
        BigDecimal runningStock
)
{
}
