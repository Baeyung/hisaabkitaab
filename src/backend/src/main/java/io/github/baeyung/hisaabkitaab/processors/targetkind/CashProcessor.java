package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import org.springframework.stereotype.Component;

@Component
public class CashProcessor implements KindProcessor
{
    @Override
    public TargetKind getTargetKind()
    {
        return TargetKind.CASH;
    }

    @Override
    public void process(EventRequest payload, InOut inOut, TransactionEvent transactionEvent)
    {

    }
}
