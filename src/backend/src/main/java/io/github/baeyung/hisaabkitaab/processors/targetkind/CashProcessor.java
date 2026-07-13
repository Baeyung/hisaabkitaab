package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class CashProcessor implements KindProcessor
{
    private final TransactionLineService transactionLineService;

    @Autowired
    public CashProcessor(TransactionLineService transactionLineService)
    {
        this.transactionLineService = transactionLineService;
    }

    @Override
    public TargetKind getTargetKind()
    {
        return TargetKind.CASH;
    }

    @Override
    public void process(
            EventRequest payload,
            InOut inOut,
            TransactionEvent transactionEvent,
            Transaction transaction,
            StoreItem storeItem
    )
    {
        if (payload.getCashAmount().compareTo(0.0d) < 0)
        {
            System.out.println("Cash amount must be greater or equal to zero");
            return;
        }

        TransactionLine transactionLine = getTransactionLine(
                payload,
                transaction,
                storeItem,
                payload.getCashAmount(),
                inOut
        );

        transactionLineService.create(transactionLine);
    }
}
