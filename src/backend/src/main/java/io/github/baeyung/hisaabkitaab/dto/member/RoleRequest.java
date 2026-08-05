package io.github.baeyung.hisaabkitaab.dto.member;

import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import jakarta.validation.constraints.NotNull;

/** Move an existing member between {@code VIEWER} and {@code EDITOR}. */
public record RoleRequest(@NotNull StoreRole role)
{
}
