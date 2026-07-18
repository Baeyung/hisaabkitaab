package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.entity.Transaction;

public interface TransactionService
{
    Transaction create(Transaction transaction);

    /** Delete a SALE (bill) owned by {@code ownerId}; its lines cascade away. */
    void deleteBill(String ownerId, String transactionId);
}
