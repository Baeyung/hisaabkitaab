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
public class StockProcessor implements KindProcessor
{
    private final TransactionLineService transactionLineService;

    @Autowired
    public StockProcessor(TransactionLineService transactionLineService)
    {
        this.transactionLineService = transactionLineService;
    }

    @Override
    public TargetKind getTargetKind()
    {
        return TargetKind.STOCK;
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
