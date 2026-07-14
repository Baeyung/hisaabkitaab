package io.github.baeyung.hisaabkitaab.service.impl;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreServiceImpl implements StoreService
{
    private final StoreRepository storeRepository;

    @Transactional
    @Override
    public Store findFirstByOwnerIdentifier(String identifier)
    {
        // A user can log in with either their email or contact number, so try both.
        return storeRepository.findAllByOwnerEmail(identifier).stream().findFirst()
                .or(() -> storeRepository.findAllByOwnerContactNumber(identifier).stream().findFirst())
                .orElse(null);
    }
}
