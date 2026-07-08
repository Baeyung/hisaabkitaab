package io.github.baeyung.hisaabkitaab.processors.transactionevent;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class ExpenseEventProcessor implements EventProcessor
{
    @Override
    public Map<TargetKind, InOut> getTargetKinds()
    {
        return Map.of(
                TargetKind.CASH, InOut.OUT
        );
    }

    @Override
    public TransactionEvent getTransactionEvent()
    {
        return TransactionEvent.EXPENSE;
    }
}
