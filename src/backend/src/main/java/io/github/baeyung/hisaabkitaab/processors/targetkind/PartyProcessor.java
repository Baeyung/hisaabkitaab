package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
import lombok.Builder;
import lombok.Getter;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class PartyProcessor implements KindProcessor
{
    private final TransactionLineService transactionLineService;

    @Autowired
    public PartyProcessor(TransactionLineService transactionLineService)
    {
        this.transactionLineService = transactionLineService;
    }

    @Override
    public TargetKind getTargetKind()
    {
        return TargetKind.PARTY;
    }

    @Override
    public void process(
            EventRequest payload,
            InOut inOut,
            TransactionEvent transactionEvent,
            Transaction transaction
    )
    {
        PartyAmountCalculations partyAmountCalculations = getPartyAmountCalculations(payload, transactionEvent, inOut);

        TransactionLine transactionLine = getTransactionLine(
                transaction,
                partyAmountCalculations.getAmount(),
                partyAmountCalculations.getInOut()
        );

        transactionLineService.create(transactionLine);
    }

    private PartyAmountCalculations getPartyAmountCalculations(
            EventRequest payload,
            TransactionEvent transactionEvent,
            InOut givenInOut
    )
    {
        if (givenInOut == null || InOut.UNKNOWN.name().equals(givenInOut.name()))
        {
            if (TransactionEvent.SALE.name().equals(transactionEvent.name()))
            {
                double amount = payload.getCashAmount() - payload.getBillAmount();
                InOut inOut;
                if (amount < 0.0d)
                {
                    inOut = InOut.IN;
                    amount = amount * -1.0d;
                }
                else
                {
                    inOut = InOut.OUT;
                }

                return PartyAmountCalculations
                        .builder()
                        .amount(amount)
                        .inOut(inOut)
                        .build();
            }

            if (TransactionEvent.PURCHASE.name().equals(transactionEvent.name()))
            {
                double amount = payload.getBillAmount() - payload.getCashAmount();
                InOut inOut;
                if (amount < 0.0d)
                {
                    inOut = InOut.IN;
                    amount = amount * -1.0d;
                }
                else
                {
                    inOut = InOut.OUT;
                }

                return PartyAmountCalculations
                        .builder()
                        .amount(amount)
                        .inOut(inOut)
                        .build();
            }
        }

        return PartyAmountCalculations
                .builder()
                .inOut(givenInOut)
                .amount(payload.getCashAmount())
                .build();
    }

    @Getter
    @Setter
    @Builder
    private static class PartyAmountCalculations
    {
        InOut inOut;
        Double amount;
    }
}
