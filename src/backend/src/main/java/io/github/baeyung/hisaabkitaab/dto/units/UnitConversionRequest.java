package io.github.baeyung.hisaabkitaab.dto.units;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Teach the shop a rate: {@code 1 fromUnit = factor toUnit}.
 *
 * <p>Sent in whatever direction the shopkeeper was working in — the service folds the units,
 * puts the pair in its canonical order and inverts the factor if it had to swap them, so the
 * caller never has to know which way round the row is stored.
 *
 * <p>A zero or negative factor is refused here as well as by the column: it is always a typo,
 * and one that would quietly convert a batch of cloth into nothing.
 */
public record UnitConversionRequest(
        @NotBlank @Size(max = 64) String fromUnit,
        @NotBlank @Size(max = 64) String toUnit,
        @NotNull @Positive BigDecimal factor
)
{
}
