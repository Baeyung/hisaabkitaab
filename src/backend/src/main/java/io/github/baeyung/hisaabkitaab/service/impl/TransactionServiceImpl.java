package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.dto.transaction.TransactionRequest;
import io.github.baeyung.hisaabkitaab.dto.transaction.TransactionResponse;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class TransactionServiceImpl implements TransactionService
{
    private final TransactionRepository transactionRepository;

    private final StoreRepository storeRepository;

    private final PartyRepository partyRepository;

    @Override
    public TransactionResponse create(TransactionRequest request)
    {
        Transaction transaction = Transaction.builder()
                .store(findStore(request.getStoreId()))
                .event(request.getEvent())
                .party(findParty(request.getPartyId()))
                .bill(request.getBill())
                .eventDate(request.getEventDate())
                .entryDate(request.getEntryDate())
                .description(request.getDescription())
                .build();

        return toResponse(transactionRepository.save(transaction));
    }

    @Override
    @Transactional(readOnly = true)
    public TransactionResponse getById(String id)
    {
        return toResponse(findEntity(id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TransactionResponse> getAll(String storeId, String partyId)
    {
        List<Transaction> transactions;
        if (StringUtils.hasText(storeId))
        {
            transactions = transactionRepository.findByStoreIdOrderByEventDateDesc(storeId);
        }
        else if (StringUtils.hasText(partyId))
        {
            transactions = transactionRepository.findByPartyId(partyId);
        }
        else
        {
            transactions = transactionRepository.findAll();
        }

        return transactions.stream().map(this::toResponse).toList();
    }

    @Override
    public TransactionResponse update(String id, TransactionRequest request)
    {
        Transaction transaction = findEntity(id);
        transaction.setStore(findStore(request.getStoreId()));
        transaction.setEvent(request.getEvent());
        transaction.setParty(findParty(request.getPartyId()));
        transaction.setBill(request.getBill());
        transaction.setEventDate(request.getEventDate());
        transaction.setEntryDate(request.getEntryDate());
        transaction.setDescription(request.getDescription());

        return toResponse(transactionRepository.save(transaction));
    }

    @Override
    public void delete(String id)
    {
        if (!transactionRepository.existsById(id))
        {
            throw ResourceNotFoundException.forEntity("Transaction", id);
        }

        transactionRepository.deleteById(id);
    }

    private Transaction findEntity(String id)
    {
        return transactionRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Transaction", id));
    }

    private Store findStore(String storeId)
    {
        return storeRepository.findById(storeId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store", storeId));
    }

    private Party findParty(String partyId)
    {
        if (!StringUtils.hasText(partyId))
        {
            return null;
        }

        return partyRepository.findById(partyId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Party", partyId));
    }

    private TransactionResponse toResponse(Transaction transaction)
    {
        return TransactionResponse.builder()
                .id(transaction.getId())
                .storeId(transaction.getStore().getId())
                .event(transaction.getEvent())
                .partyId(transaction.getParty() != null ? transaction.getParty().getId() : null)
                .bill(transaction.getBill())
                .eventDate(transaction.getEventDate())
                .entryDate(transaction.getEntryDate())
                .description(transaction.getDescription())
                .createdAt(transaction.getCreatedAt())
                .build();
    }
}
