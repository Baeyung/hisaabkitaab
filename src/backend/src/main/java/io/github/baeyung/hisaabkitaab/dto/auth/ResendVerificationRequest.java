package io.github.baeyung.hisaabkitaab.dto.auth;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ResendVerificationRequest
{
    /** Contact number or email of the account to resend the verification link to. */
    @NotBlank
    private String identifier;
}
