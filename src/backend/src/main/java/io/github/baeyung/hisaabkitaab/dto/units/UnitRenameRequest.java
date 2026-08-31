package io.github.baeyung.hisaabkitaab.dto.units;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UnitRenameRequest(
        @NotBlank @Size(max = 64) String name
)
{
}
