package io.github.baeyung.hisaabkitaab.dto.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UserRequest
{
    @NotBlank
    private String contactNumber;

    @NotBlank
    private String password;

    @NotBlank
    private String name;

    @Email
    private String email;
}
