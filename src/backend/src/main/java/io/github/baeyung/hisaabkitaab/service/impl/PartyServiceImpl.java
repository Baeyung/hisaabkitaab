package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.dto.party.PartyRequest;
import io.github.baeyung.hisaabkitaab.dto.party.PartyResponse;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class PartyServiceImpl implements PartyService
{
    private final PartyRepository partyRepository;

    private final StoreRepository storeRepository;

    @Override
    public PartyResponse create(PartyRequest request)
    {
        Party party = Party.builder()
                .store(findStore(request.getStoreId()))
                .name(request.getName())
                .contact(request.getContact())
                .address(request.getAddress())
                .build();

        return toResponse(partyRepository.save(party));
    }

    @Override
    @Transactional(readOnly = true)
    public PartyResponse getById(String id)
    {
        return toResponse(findEntity(id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<PartyResponse> getAll(String storeId)
    {
        List<Party> parties = StringUtils.hasText(storeId)
                ? partyRepository.findByStoreId(storeId)
                : partyRepository.findAll();

        return parties.stream().map(this::toResponse).toList();
    }

    @Override
    public PartyResponse update(String id, PartyRequest request)
    {
        Party party = findEntity(id);
        party.setStore(findStore(request.getStoreId()));
        party.setName(request.getName());
        party.setContact(request.getContact());
        party.setAddress(request.getAddress());

        return toResponse(partyRepository.save(party));
    }

    @Override
    public void delete(String id)
    {
        if (!partyRepository.existsById(id))
        {
            throw ResourceNotFoundException.forEntity("Party", id);
        }

        partyRepository.deleteById(id);
    }

    private Party findEntity(String id)
    {
        return partyRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Party", id));
    }

    private Store findStore(String storeId)
    {
        return storeRepository.findById(storeId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store", storeId));
    }

    private PartyResponse toResponse(Party party)
    {
        return PartyResponse.builder()
                .id(party.getId())
                .storeId(party.getStore().getId())
                .name(party.getName())
                .contact(party.getContact())
                .address(party.getAddress())
                .build();
    }
}
