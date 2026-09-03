package io.github.baeyung.hisaabkitaab.dto.units;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The one field a unit has, sent when adding one to the list or renaming one already on it. */
public record UnitNameRequest(
        @NotBlank @Size(max = 64) String name
)
{
}
