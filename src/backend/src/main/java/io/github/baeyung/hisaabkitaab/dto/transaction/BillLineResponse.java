package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.math.BigDecimal;

public record BillLineResponse(
        String itemId,
        String itemName,
        BigDecimal quantity,
        String unit,
        double rate,
        double amount
)
{
}
