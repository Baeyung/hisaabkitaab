package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(PartyServiceImpl.class);

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

        Party saved = partyRepository.save(party);
        log.info("created party {} \"{}\" in store {}", saved.getId(), saved.getName(), store.getId());
        return saved;
    }

    @Override
    public Party resolveOrCreate(String partyId, String name, Store store)
    {
        if (StringUtils.hasText(partyId))
        {
            return findByIdForStore(partyId, store.getId());
        }

        // Worth a line of its own: a party appearing out of an entry screen rather than the
        // parties page is the usual explanation for a duplicate nobody remembers adding.
        log.info("no party id on the entry, creating \"{}\" in store {}", name, store.getId());

        return create(
                Party.builder()
                        .name(name)
                        .contact(Party.PLACEHOLDER_CONTACT)
                        .address("address@HisaabKitaab")
                        .build(),
                store
        );
    }

    @Override
    public Party update(String id, Party changes, String storeId)
    {
        Party party = findByIdForStore(id, storeId);

        log.info("updating party {} \"{}\" -> \"{}\" in store {}",
                id, party.getName(), changes.getName(), storeId);

        party.setName(changes.getName());
        party.setContact(changes.getContact());
        party.setAddress(changes.getAddress());

        return partyRepository.save(party);
    }

    @Override
    public void delete(String id, String storeId)
    {
        Party party = findByIdForStore(id, storeId);
        long startedAt = System.nanoTime();

        // Cascade: delete every transaction that references this party, whether as the transaction's
        // counterparty or on one of its lines (their lines go via orphanRemoval).
        List<Transaction> transactions = Stream
                .concat(
                        transactionRepository.findByPartyId(id).stream(),
                        transactionLineRepository.findByPartyId(id).stream().map(TransactionLine::getTransaction)
                )
                .distinct()
                .toList();

        // Announced before the delete rather than after, and with the count: this is the one
        // operation whose cost is unbounded in the data — a party with a year of entries takes
        // as long as it takes — and without this line a slow one is indistinguishable from a
        // hung one. The count is also the answer to "why did that take so long".
        log.info("deleting party {} \"{}\" from store {}, cascading {} transaction(s)",
                id, party.getName(), storeId, transactions.size());

        transactionRepository.deleteAll(transactions);
        partyRepository.delete(party);

        log.info("deleted party {} and its {} transaction(s) in {}ms",
                id, transactions.size(), (System.nanoTime() - startedAt) / 1_000_000);
    }
}
