package io.github.baeyung.hisaabkitaab.dto.auth;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ResetPasswordRequest
{
    /** Single-use token from the reset link. */
    @NotBlank
    private String token;

    /** The new password to set. */
    @NotBlank
    private String password;
}
