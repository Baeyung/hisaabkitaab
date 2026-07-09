package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.storeitem.StoreItemRequest;
import io.github.baeyung.hisaabkitaab.dto.storeitem.StoreItemResponse;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;

public interface StoreItemService
{
    StoreItemResponse create(StoreItemRequest request);

    StoreItemResponse getById(String id);

    StoreItem findEntity(String id);

    List<StoreItemResponse> getAll(String storeId);

    StoreItemResponse update(String id, StoreItemRequest request);

    void delete(String id);
}
