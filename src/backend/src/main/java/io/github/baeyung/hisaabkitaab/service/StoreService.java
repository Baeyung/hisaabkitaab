package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.store.StoreRequest;
import io.github.baeyung.hisaabkitaab.dto.store.StoreResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;

public interface StoreService
{
    StoreResponse create(StoreRequest request);

    StoreResponse getById(String id);

    Store findFirstByOwnerId(String ownerId);

    Store findFirstByOwnerEmail(String ownerId);

    List<StoreResponse> getAll(String ownerId);

    StoreResponse update(String id, StoreRequest request);

    void delete(String id);
}
