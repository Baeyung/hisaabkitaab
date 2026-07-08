package io.github.baeyung.hisaabkitaab.dto.storeitem;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class StoreItemRequest
{
    @NotBlank
    private String storeId;

    @NotBlank
    private String name;

    private String unit;

    @PositiveOrZero
    private BigDecimal salePrice;

    @PositiveOrZero
    private BigDecimal costPrice;
}
