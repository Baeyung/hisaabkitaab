package io.github.baeyung.hisaabkitaab.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class VerifyResetOtpRequest
{
    /** Email the reset code was sent to. */
    @NotBlank
    @Email
    private String email;

    /** The 6-digit code from the reset email. */
    @NotBlank
    @Pattern(regexp = "\\d{6}")
    private String otp;
}
