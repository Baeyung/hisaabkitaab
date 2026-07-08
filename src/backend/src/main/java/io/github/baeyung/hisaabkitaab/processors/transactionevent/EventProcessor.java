package io.github.baeyung.hisaabkitaab.processors.transactionevent;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

import java.util.Map;

public interface EventProcessor
{
    Map<TargetKind, InOut> getTargetKinds();

    TransactionEvent getTransactionEvent();
}
