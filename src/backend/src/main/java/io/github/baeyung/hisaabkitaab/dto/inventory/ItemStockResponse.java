package io.github.baeyung.hisaabkitaab.dto.inventory;

import java.math.BigDecimal;

public record ItemStockResponse(
        String itemId,
        String name,
        String unit,
        BigDecimal salePrice,
        BigDecimal costPrice,
        BigDecimal currentStock
)
{
}
