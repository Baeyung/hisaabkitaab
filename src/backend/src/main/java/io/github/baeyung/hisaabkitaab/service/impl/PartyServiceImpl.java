package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class PartyServiceImpl implements PartyService
{
    private final PartyRepository partyRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;
    private final StoreService storeService;

    @Override
    @Transactional(readOnly = true)
    public Party findEntity(String id)
    {
        return partyRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Party", id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<Party> findByOwner(String ownerId)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        return partyRepository.findByStoreId(store.getId());
    }

    @Override
    @Transactional(readOnly = true)
    public Party findByIdForOwner(String id, String ownerId)
    {
        // A party in another owner's store is reported as not-found so we never leak its existence.
        return partyRepository.findById(id)
                .filter(party -> party.getStore().getOwner().getId().equals(ownerId))
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Party", id));
    }

    @Override
    public Party create(Party input, String ownerId)
    {
        // ownerId is a user-id from PartyController or an email/contact from EventService's
        // dynamic-party path — findFirstByOwnerIdentifier resolves the store from any of them.
        Party party = Party.builder()
                .store(storeService.findFirstByOwnerIdentifier(ownerId))
                .name(input.getName())
                .contact(input.getContact())
                .address(input.getAddress())
                .build();

        return partyRepository.save(party);
    }

    @Override
    public Party update(String id, Party changes, String ownerId)
    {
        Party party = findByIdForOwner(id, ownerId);

        party.setName(changes.getName());
        party.setContact(changes.getContact());
        party.setAddress(changes.getAddress());

        return partyRepository.save(party);
    }

    @Override
    public void delete(String id, String ownerId)
    {
        Party party = findByIdForOwner(id, ownerId);

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
