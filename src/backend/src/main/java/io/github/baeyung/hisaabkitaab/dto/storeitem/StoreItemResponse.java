package io.github.baeyung.hisaabkitaab.dto.storeitem;

import java.math.BigDecimal;

import io.github.baeyung.hisaabkitaab.entity.StoreItem;

/**
 * An item for the settings list: its editable fields plus the current opening
 * stock ({@code null} when none is set), so the row can show it and the
 * opening-stock editor can prefill.
 */
public record StoreItemResponse(
        String id,
        String name,
        String unit,
        BigDecimal salePrice,
        BigDecimal costPrice,
        BigDecimal openingStock
)
{
    public static StoreItemResponse of(StoreItem item, BigDecimal openingStock)
    {
        return new StoreItemResponse(item.getId(), item.getName(), item.getUnit(),
                item.getSalePrice(), item.getCostPrice(), openingStock);
    }
}
