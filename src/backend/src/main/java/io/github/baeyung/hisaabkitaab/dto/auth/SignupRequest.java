package io.github.baeyung.hisaabkitaab.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SignupRequest
{
    @NotBlank
    private String name;

    /** Digits only, 7-15 of them (the E.164 ceiling). Doubles as a login identifier,
     *  so the stored form has to be exactly what the user types back at login. */
    @NotBlank
    @Pattern(regexp = "\\d{7,15}")
    private String contactNumber;

    // Required now that email verification gates access — no email means no way to verify.
    @NotBlank
    @Email(regexp = "^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$")
    private String email;

    /** 8+ characters with at least one digit and one non-alphanumeric. Mirrors
     *  PASSWORD_PATTERN in the frontend's password-field.ts. Only new passwords
     *  are held to this — login takes whatever an older account was created with. */
    @NotBlank
    @Pattern(regexp = "^(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$")
    private String password;
}
