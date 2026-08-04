package io.github.baeyung.hisaabkitaab.dto.inventory;

import java.math.BigDecimal;

/** {@code currentStock} is null for a service — work sold carries no on-hand quantity. */
public record ItemStockResponse(
        String itemId,
        String name,
        String unit,
        BigDecimal salePrice,
        BigDecimal costPrice,
        BigDecimal currentStock,
        boolean service
)
{
}
