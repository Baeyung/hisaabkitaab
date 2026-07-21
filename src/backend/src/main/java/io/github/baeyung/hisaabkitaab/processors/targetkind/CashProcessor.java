package io.github.baeyung.hisaabkitaab.processors.targetkind;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService;
import io.github.baeyung.hisaabkitaab.service.TransactionLineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class CashProcessor implements KindProcessor
{
    private final TransactionLineService transactionLineService;
    private final ExpenseCategoryService expenseCategoryService;

    @Autowired
    public CashProcessor(TransactionLineService transactionLineService,
                         ExpenseCategoryService expenseCategoryService)
    {
        this.transactionLineService = transactionLineService;
        this.expenseCategoryService = expenseCategoryService;
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
            Transaction transaction
    )
    {
        if (payload.getCashAmount().compareTo(0.0d) < 0)
        {
            System.out.println("Cash amount must be greater or equal to zero");
            return;
        }

        TransactionLine transactionLine = getTransactionLine(
                transaction,
                payload.getCashAmount(),
                inOut
        );

        if (transactionEvent == TransactionEvent.EXPENSE)
        {
            transactionLine.setExpenseCategory(
                    expenseCategoryService.resolveOrCreate(
                            transaction.getStore(), payload.getExpenseCategory())
            );
        }

        transactionLineService.create(transactionLine);
    }
}
