package io.github.baeyung.hisaabkitaab.dto.units;

import io.github.baeyung.hisaabkitaab.entity.Unit;

/** One unit name on this store's list, as the Units screen manages it. */
public record UnitResponse(String id, String name)
{
    public static UnitResponse of(Unit unit)
    {
        return new UnitResponse(unit.getId(), unit.getName());
    }
}
