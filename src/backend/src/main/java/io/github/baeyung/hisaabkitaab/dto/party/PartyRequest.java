package io.github.baeyung.hisaabkitaab.dto.party;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PartyRequest
{
    @NotBlank
    private String storeId;

    @NotBlank
    private String name;

    private String contact;

    private String address;
}
