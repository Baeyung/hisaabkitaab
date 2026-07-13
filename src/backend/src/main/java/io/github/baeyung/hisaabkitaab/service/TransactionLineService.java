package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.transactionline.TransactionLineRequest;
import io.github.baeyung.hisaabkitaab.dto.transactionline.TransactionLineResponse;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;

public interface TransactionLineService
{
    TransactionLineResponse create(TransactionLineRequest request);

    TransactionLine create(TransactionLine request);

    TransactionLineResponse getById(String id);

    List<TransactionLineResponse> getAll(String transactionId, String partyId, String itemId);

    TransactionLineResponse update(String id, TransactionLineRequest request);

    void delete(String id);
}
