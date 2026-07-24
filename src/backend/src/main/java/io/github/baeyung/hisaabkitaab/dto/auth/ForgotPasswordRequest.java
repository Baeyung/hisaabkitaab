package io.github.baeyung.hisaabkitaab.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ForgotPasswordRequest
{
    /** Email of the account to send a password-reset link to. */
    @NotBlank
    @Email
    private String email;
}
