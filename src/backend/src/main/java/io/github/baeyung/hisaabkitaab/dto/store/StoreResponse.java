package io.github.baeyung.hisaabkitaab.dto.store;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class StoreResponse
{
    private String id;

    private String ownerId;

    private String name;

    private String address;

    private String contact;

    private String logoUri;

    private String watermarkUri;
}
