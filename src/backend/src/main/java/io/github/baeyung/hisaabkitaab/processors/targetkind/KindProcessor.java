package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
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
            Transaction transaction,
            StoreItem storeItem
    );

    default TransactionLine getTransactionLine(
            EventRequest payload,
            Transaction transaction,
            StoreItem storeItem,
            double amount,
            InOut inOut
    )
    {
        return TransactionLine
                .builder()
                .inOut(inOut)
                .transaction(transaction)
                .item(storeItem)
                .value(amount)
                .targetKind(getTargetKind())
                .unit("gaz")
                .party(transaction.getParty())
                .quantity(payload.getItem().getQuantity())
                .build();
    }

//    default Double getAmountBasedOnInOut(InOut inOut, Double amount)
//    {
//        return switch (inOut)
//        {
//            case IN -> amount;
//            case OUT -> 0.0d - amount;
//            case UNKNOWN -> null;
//            default -> 0.0d;
//        };
//    }
}
