package io.github.baeyung.hisaabkitaab.dto.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * What a signed-in account may change about itself. Deliberately no email: it is the
 * address the account was verified against, and the one a password reset is mailed to —
 * letting it move would hand the account to whoever typed the new address.
 *
 * @param contactNumber same rule as signup, since it is also a login identifier.
 */
public record ProfileRequest(
        @NotBlank String name,
        @NotBlank @Pattern(regexp = "\\d{7,15}") String contactNumber)
{
}
