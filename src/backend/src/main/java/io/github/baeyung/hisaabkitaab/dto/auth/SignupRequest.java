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

    @Email(regexp = "^[^@\\s]+@[^@\\s]+\\.[A-Za-z]{2,}$")
    private String email;

    @NotBlank
    private String password;
}
