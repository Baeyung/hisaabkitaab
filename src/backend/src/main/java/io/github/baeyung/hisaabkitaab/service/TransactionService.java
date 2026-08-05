package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.entity.Transaction;

public interface TransactionService
{
    Transaction create(Transaction transaction);

    /**
     * Delete a SALE (bill) belonging to {@code storeId}; its lines cascade away.
     *
     * @param recentOnly the caller is not the shop's owner, so the bill has to still be inside
     *                   {@link io.github.baeyung.hisaabkitaab.entity.Transaction#DELETE_WINDOW}
     */
    void deleteBill(String storeId, String transactionId, boolean recentOnly);
}
