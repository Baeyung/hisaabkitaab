package io.github.baeyung.hisaabkitaab.dto.member;

import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Give someone access to a store. Same email pattern as signup, since it may create an account. */
public record InviteRequest(
        @NotBlank @Email(regexp = "^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$") String email,
        @NotNull StoreRole role)
{
}
