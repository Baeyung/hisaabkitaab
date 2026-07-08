package io.github.baeyung.hisaabkitaab.dto.storeitem;

import java.math.BigDecimal;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class StoreItemResponse
{
    private String id;

    private String storeId;

    private String name;

    private String unit;

    private BigDecimal salePrice;

    private BigDecimal costPrice;
}
