package io.github.baeyung.hisaabkitaab.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SignupRequest
{
    @NotBlank
    private String name;

    @NotBlank
    private String contactNumber;

    // Required now that email verification gates access — no email means no way to verify.
    @NotBlank
    @Email
    private String email;

    @NotBlank
    private String password;
}
