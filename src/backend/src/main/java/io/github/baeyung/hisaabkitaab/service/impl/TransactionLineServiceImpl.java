package io.github.baeyung.hisaabkitaab.service.impl;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import io.github.baeyung.hisaabkitaab.dto.transactionline.TransactionLineRequest;
import io.github.baeyung.hisaabkitaab.dto.transactionline.TransactionLineResponse;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class TransactionLineServiceImpl implements TransactionLineService
{
    private final TransactionLineRepository transactionLineRepository;

    private final TransactionRepository transactionRepository;

    private final PartyRepository partyRepository;

    private final StoreItemRepository storeItemRepository;

    @Override
    public TransactionLineResponse create(TransactionLineRequest request)
    {
        TransactionLine line = TransactionLine.builder()
                .transaction(findTransaction(request.getTransactionId()))
                .targetKind(request.getTargetKind())
                .party(findParty(request.getPartyId()))
                .item(findItem(request.getItemId()))
                .inOut(request.getInOut())
                .quantity(request.getQuantity())
                .unit(request.getUnit())
                .build();

        return toResponse(transactionLineRepository.save(line));
    }

    @Override
    @Transactional(readOnly = true)
    public TransactionLineResponse getById(String id)
    {
        return toResponse(findEntity(id));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TransactionLineResponse> getAll(String transactionId, String partyId, String itemId)
    {
        List<TransactionLine> lines;
        if (StringUtils.hasText(transactionId))
        {
            lines = transactionLineRepository.findByTransactionId(transactionId);
        }
        else if (StringUtils.hasText(partyId))
        {
            lines = transactionLineRepository.findByPartyId(partyId);
        }
        else if (StringUtils.hasText(itemId))
        {
            lines = transactionLineRepository.findByItemId(itemId);
        }
        else
        {
            lines = transactionLineRepository.findAll();
        }

        return lines.stream().map(this::toResponse).toList();
    }

    @Override
    public TransactionLineResponse update(String id, TransactionLineRequest request)
    {
        TransactionLine line = findEntity(id);
        line.setTransaction(findTransaction(request.getTransactionId()));
        line.setTargetKind(request.getTargetKind());
        line.setParty(findParty(request.getPartyId()));
        line.setItem(findItem(request.getItemId()));
        line.setInOut(request.getInOut());
        line.setQuantity(request.getQuantity());
        line.setUnit(request.getUnit());

        return toResponse(transactionLineRepository.save(line));
    }

    @Override
    public void delete(String id)
    {
        if (!transactionLineRepository.existsById(id))
        {
            throw ResourceNotFoundException.forEntity("TransactionLine", id);
        }

        transactionLineRepository.deleteById(id);
    }

    private TransactionLine findEntity(String id)
    {
        return transactionLineRepository.findById(id)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("TransactionLine", id));
    }

    private Transaction findTransaction(String transactionId)
    {
        return transactionRepository.findById(transactionId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Transaction", transactionId));
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

    private StoreItem findItem(String itemId)
    {
        if (!StringUtils.hasText(itemId))
        {
            return null;
        }

        return storeItemRepository.findById(itemId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("StoreItem", itemId));
    }

    private TransactionLineResponse toResponse(TransactionLine line)
    {
        return TransactionLineResponse.builder()
                .id(line.getId())
                .transactionId(line.getTransaction().getId())
                .targetKind(line.getTargetKind())
                .partyId(line.getParty() != null ? line.getParty().getId() : null)
                .itemId(line.getItem() != null ? line.getItem().getId() : null)
                .inOut(line.getInOut())
                .quantity(line.getQuantity())
                .unit(line.getUnit())
                .build();
    }
}
