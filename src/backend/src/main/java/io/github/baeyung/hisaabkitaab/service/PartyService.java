package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.party.PartyRequest;
import io.github.baeyung.hisaabkitaab.dto.party.PartyResponse;

public interface PartyService
{
    PartyResponse create(PartyRequest request);

    PartyResponse getById(String id);

    List<PartyResponse> getAll(String storeId);

    PartyResponse update(String id, PartyRequest request);

    void delete(String id);
}
