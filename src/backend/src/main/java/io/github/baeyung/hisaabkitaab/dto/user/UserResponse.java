package io.github.baeyung.hisaabkitaab.dto.user;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class UserResponse
{
    private String id;

    private String contactNumber;

    private String name;

    private String email;
}
