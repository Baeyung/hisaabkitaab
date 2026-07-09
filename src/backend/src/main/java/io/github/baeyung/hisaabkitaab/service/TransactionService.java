package io.github.baeyung.hisaabkitaab.service;

import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.transaction.TransactionRequest;
import io.github.baeyung.hisaabkitaab.dto.transaction.TransactionResponse;
import io.github.baeyung.hisaabkitaab.entity.Transaction;

public interface TransactionService
{
    TransactionResponse create(TransactionRequest request);

    Transaction createEntity(TransactionRequest request);

    TransactionResponse getById(String id);

    List<TransactionResponse> getAll(String storeId, String partyId);

    TransactionResponse update(String id, TransactionRequest request);

    void delete(String id);
}
