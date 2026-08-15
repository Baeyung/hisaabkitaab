package io.github.baeyung.hisaabkitaab.dto.units;

import java.math.BigDecimal;

import io.github.baeyung.hisaabkitaab.entity.UnitConversion;

/**
 * One rate the shop has taught us, as the entry screens read it: {@code 1 fromUnit =
 * factor toUnit}, both units folded.
 *
 * <p>The list comes back in one direction only, because that is all there is to know — the
 * client inverts for the other way round, the same way the service does.
 */
public record UnitConversionResponse(
        String id,
        String fromUnit,
        String toUnit,
        BigDecimal factor
)
{
    public static UnitConversionResponse of(UnitConversion conversion)
    {
        return new UnitConversionResponse(conversion.getId(), conversion.getFromUnit(),
                conversion.getToUnit(), conversion.getFactor());
    }
}
