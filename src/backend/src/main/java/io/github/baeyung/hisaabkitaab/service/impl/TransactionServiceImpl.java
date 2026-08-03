package io.github.baeyung.hisaabkitaab.service.impl;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.TransactionService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class TransactionServiceImpl implements TransactionService
{
    private final TransactionRepository transactionRepository;

    @Override
    public Transaction create(Transaction transaction)
    {
        return transactionRepository.save(transaction);
    }

    @Override
    public void deleteBill(String storeId, String transactionId)
    {
        // Scoped by store, and a non-SALE id is "not found" — bills are only ever sales.
        Transaction bill = transactionRepository.findByIdAndStoreId(transactionId, storeId)
                .filter(t -> t.getEvent() == TransactionEvent.SALE)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Bill", transactionId));

        // Lines go with it via cascade + orphanRemoval; every balance is folded from
        // lines, so removing the transaction reverses its khata, cash and stock effects.
        transactionRepository.delete(bill);
    }
}
