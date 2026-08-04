package io.github.baeyung.hisaabkitaab.dto.inventory;

import java.math.BigDecimal;
import java.util.List;

public record ItemMovementResponse(
        String itemId,
        String name,
        String unit,
        BigDecimal currentStock,
        boolean service,
        List<ItemMovementRowResponse> rows
)
{
}
