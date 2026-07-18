package io.github.baeyung.hisaabkitaab.dto.opening;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

/**
 * Set an item's opening stock: the quantity on hand at onboarding, always an IN
 * stock line. Zero clears the opening (see OpeningEntryService).
 */
public record OpeningStockRequest(
        @NotNull @PositiveOrZero BigDecimal quantity
)
{
}
