package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class PartyServiceImpl implements PartyService
{
    private final PartyRepository partyRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;

    @Override
    @Transactional(readOnly = true)
    public Party findEntity(String id)
    {
        return partyRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Party", id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<Party> findByStore(String storeId)
    {
        return partyRepository.findByStoreId(storeId);
    }

    @Override
    @Transactional(readOnly = true)
    public Party findByIdForStore(String id, String storeId)
    {
        // A party in another store is reported as not-found so we never leak its existence.
        return partyRepository.findById(id)
                .filter(party -> party.getStore().getId().equals(storeId))
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Party", id));
    }

    @Override
    public Party create(Party input, Store store)
    {
        Party party = Party.builder()
                .store(store)
                .name(input.getName())
                .contact(input.getContact())
                .address(input.getAddress())
                .build();

        return partyRepository.save(party);
    }

    @Override
    public Party resolveOrCreate(String partyId, String name, Store store)
    {
        if (StringUtils.hasText(partyId))
        {
            return findByIdForStore(partyId, store.getId());
        }

        return create(
                Party.builder()
                        .name(name)
                        .contact("090078601")
                        .address("address@HisaabKitaab")
                        .build(),
                store
        );
    }

    @Override
    public Party update(String id, Party changes, String storeId)
    {
        Party party = findByIdForStore(id, storeId);

        party.setName(changes.getName());
        party.setContact(changes.getContact());
        party.setAddress(changes.getAddress());

        return partyRepository.save(party);
    }

    @Override
    public void delete(String id, String storeId)
    {
        Party party = findByIdForStore(id, storeId);

        // Cascade: delete every transaction that references this party, whether as the transaction's
        // counterparty or on one of its lines (their lines go via orphanRemoval).
        List<Transaction> transactions = Stream
                .concat(
                        transactionRepository.findByPartyId(id).stream(),
                        transactionLineRepository.findByPartyId(id).stream().map(TransactionLine::getTransaction)
                )
                .distinct()
                .toList();
        transactionRepository.deleteAll(transactions);

        partyRepository.delete(party);
    }
}
