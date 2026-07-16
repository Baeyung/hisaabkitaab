package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

public interface KindProcessor
{
    TargetKind getTargetKind();

    void process(
            EventRequest payload,
            InOut inOut,
            TransactionEvent transactionEvent,
            Transaction transaction
    );

    default TransactionLine getTransactionLine(
            Transaction transaction,
            double amount,
            InOut inOut
    )
    {
        return TransactionLine
                .builder()
                .inOut(inOut)
                .transaction(transaction)
                .value(amount)
                .targetKind(getTargetKind())
                .unit("gaz")
                .party(transaction.getParty())
                .build();
    }
}
