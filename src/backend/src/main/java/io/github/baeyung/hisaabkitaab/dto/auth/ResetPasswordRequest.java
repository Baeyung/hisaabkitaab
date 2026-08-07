package io.github.baeyung.hisaabkitaab.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ResetPasswordRequest
{
    /** Email the reset code was sent to. */
    @NotBlank
    @Email
    private String email;

    /** The 6-digit code from the reset email, re-checked here before the password changes. */
    @NotBlank
    @Pattern(regexp = "\\d{6}")
    private String otp;

    /** The new password to set — same rules as signup, see SignupRequest#password. */
    @NotBlank
    @Pattern(regexp = "^(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$")
    private String password;
}
