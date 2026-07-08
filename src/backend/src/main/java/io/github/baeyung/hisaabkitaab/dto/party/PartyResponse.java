package io.github.baeyung.hisaabkitaab.dto.party;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class PartyResponse
{
    private String id;

    private String storeId;

    private String name;

    private String contact;

    private String address;
}
