package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.entity.Transaction;

public interface TransactionService
{
    Transaction create(Transaction transaction);

    /** Delete a SALE (bill) belonging to {@code storeId}; its lines cascade away. */
    void deleteBill(String storeId, String transactionId);
}
