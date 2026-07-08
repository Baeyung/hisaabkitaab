package io.github.baeyung.hisaabkitaab.dto.store;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class StoreRequest
{
    @NotBlank
    private String ownerId;

    @NotBlank
    private String name;

    private String address;

    private String contact;

    private String logoUri;

    private String watermarkUri;
}
