package io.github.baeyung.hisaabkitaab.service.impl;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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
    public void deleteBill(String storeId, String transactionId, boolean recentOnly)
    {
        // Scoped by store, and a non-SALE id is "not found" — bills are only ever sales.
        Transaction bill = transactionRepository.findByIdAndStoreId(transactionId, storeId)
                .filter(t -> t.getEvent() == TransactionEvent.SALE)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Bill", transactionId));

        // Erasing settled history is the owner's call; a shared user only gets to take back
        // what they have just booked.
        if (recentOnly && !bill.isRecent())
        {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Only the shop owner can delete entries older than 24 hours");
        }

        // Lines go with it via cascade + orphanRemoval; every balance is folded from
        // lines, so removing the transaction reverses its khata, cash and stock effects.
        transactionRepository.delete(bill);
    }
}
