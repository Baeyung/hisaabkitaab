package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.dto.store.StoreRequest;
import io.github.baeyung.hisaabkitaab.dto.store.StoreResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreServiceImpl implements StoreService
{
    private final StoreRepository storeRepository;

    private final UserRepository userRepository;

    @Override
    public StoreResponse create(StoreRequest request)
    {
        Store store = Store.builder()
                .owner(findOwner(request.getOwnerId()))
                .name(request.getName())
                .address(request.getAddress())
                .contact(request.getContact())
                .logoUri(request.getLogoUri())
                .watermarkUri(request.getWatermarkUri())
                .build();

        return toResponse(storeRepository.save(store));
    }

    @Override
    @Transactional(readOnly = true)
    public StoreResponse getById(String id)
    {
        return toResponse(findEntity(id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<StoreResponse> getAll(String ownerId)
    {
        List<Store> stores = StringUtils.hasText(ownerId)
                ? storeRepository.findByOwnerId(ownerId)
                : storeRepository.findAll();

        return stores.stream().map(this::toResponse).toList();
    }

    @Override
    public StoreResponse update(String id, StoreRequest request)
    {
        Store store = findEntity(id);
        store.setOwner(findOwner(request.getOwnerId()));
        store.setName(request.getName());
        store.setAddress(request.getAddress());
        store.setContact(request.getContact());
        store.setLogoUri(request.getLogoUri());
        store.setWatermarkUri(request.getWatermarkUri());

        return toResponse(storeRepository.save(store));
    }

    @Override
    public void delete(String id)
    {
        if (!storeRepository.existsById(id))
        {
            throw ResourceNotFoundException.forEntity("Store", id);
        }

        storeRepository.deleteById(id);
    }

    private Store findEntity(String id)
    {
        return storeRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store", id));
    }

    private User findOwner(String ownerId)
    {
        return userRepository.findById(ownerId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("User", ownerId));
    }

    private StoreResponse toResponse(Store store)
    {
        return StoreResponse.builder()
                .id(store.getId())
                .ownerId(store.getOwner().getId())
                .name(store.getName())
                .address(store.getAddress())
                .contact(store.getContact())
                .logoUri(store.getLogoUri())
                .watermarkUri(store.getWatermarkUri())
                .build();
    }
}
