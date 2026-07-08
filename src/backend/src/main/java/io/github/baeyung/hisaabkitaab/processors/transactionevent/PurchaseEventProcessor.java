package io.github.baeyung.hisaabkitaab.processors.transactionevent;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class PurchaseEventProcessor implements EventProcessor
{
    @Override
    public Map<TargetKind, InOut> getTargetKinds()
    {
        return Map.of(
                TargetKind.CASH, InOut.OUT,
                TargetKind.PARTY, InOut.UNKNOWN, // INOUT will be calculated based on bill amount - cash amount
                TargetKind.STOCK, InOut.IN
        );
    }

    @Override
    public TransactionEvent getTransactionEvent()
    {
        return TransactionEvent.PURCHASE;
    }
}
