package io.github.baeyung.hisaabkitaab.dto.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class VerifyRequest
{
    /** Contact number or email of the account being verified. */
    @NotBlank
    private String identifier;

    /** The 6-digit code from the verification email. */
    @NotBlank
    @Pattern(regexp = "\\d{6}")
    private String otp;
}
