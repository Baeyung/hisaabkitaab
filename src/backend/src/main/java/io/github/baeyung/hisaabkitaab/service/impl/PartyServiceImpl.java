package io.github.baeyung.hisaabkitaab.service.impl;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class PartyServiceImpl implements PartyService
{
    private final PartyRepository partyRepository;

    @Override
    @Transactional(readOnly = true)
    public Party findEntity(String id)
    {
        return partyRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Party", id));
    }
}
