package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.dto.storeitem.StoreItemRequest;
import io.github.baeyung.hisaabkitaab.dto.storeitem.StoreItemResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.service.StoreItemService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreItemServiceImpl implements StoreItemService
{
    private final StoreItemRepository storeItemRepository;

    private final StoreRepository storeRepository;

    @Override
    public StoreItemResponse create(StoreItemRequest request)
    {
        StoreItem item = StoreItem.builder()
                .store(findStore(request.getStoreId()))
                .name(request.getName())
                .unit(request.getUnit())
                .salePrice(request.getSalePrice())
                .costPrice(request.getCostPrice())
                .build();

        return toResponse(storeItemRepository.save(item));
    }

    @Override
    @Transactional(readOnly = true)
    public StoreItemResponse getById(String id)
    {
        return toResponse(findEntity(id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<StoreItemResponse> getAll(String storeId)
    {
        List<StoreItem> items = StringUtils.hasText(storeId)
                ? storeItemRepository.findByStoreId(storeId)
                : storeItemRepository.findAll();

        return items.stream().map(this::toResponse).toList();
    }

    @Override
    public StoreItemResponse update(String id, StoreItemRequest request)
    {
        StoreItem item = findEntity(id);
        item.setStore(findStore(request.getStoreId()));
        item.setName(request.getName());
        item.setUnit(request.getUnit());
        item.setSalePrice(request.getSalePrice());
        item.setCostPrice(request.getCostPrice());

        return toResponse(storeItemRepository.save(item));
    }

    @Override
    public void delete(String id)
    {
        if (!storeItemRepository.existsById(id))
        {
            throw ResourceNotFoundException.forEntity("StoreItem", id);
        }

        storeItemRepository.deleteById(id);
    }

    private StoreItem findEntity(String id)
    {
        return storeItemRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("StoreItem", id));
    }

    private Store findStore(String storeId)
    {
        return storeRepository.findById(storeId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store", storeId));
    }

    private StoreItemResponse toResponse(StoreItem item)
    {
        return StoreItemResponse.builder()
                .id(item.getId())
                .storeId(item.getStore().getId())
                .name(item.getName())
                .unit(item.getUnit())
                .salePrice(item.getSalePrice())
                .costPrice(item.getCostPrice())
                .build();
    }
}
