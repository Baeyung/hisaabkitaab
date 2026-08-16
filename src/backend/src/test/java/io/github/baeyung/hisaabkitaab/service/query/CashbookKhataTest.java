package io.github.baeyung.hisaabkitaab.service.query;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.github.baeyung.hisaabkitaab.dto.cashbook.CashbookDayResponse;
import io.github.baeyung.hisaabkitaab.dto.common.BalanceDirection;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

/**
 * The cashbook shows what the drawer did; the khata column shows what the same entries did
 * to the party balances, so a part-paid sale doesn't read as if the rest of the money simply
 * vanished. The column is only ever as good as the pairing between a cash row and its
 * transaction's party lines — which is what these pin down.
 */
@ExtendWith(MockitoExtension.class)
class CashbookKhataTest
{
    private static final String STORE = "s1";
    private static final LocalDate DAY = LocalDate.of(2026, 8, 17);

    @Mock
    private TransactionLineRepository transactionLineRepository;
    @Mock
    private TransactionRepository transactionRepository;
    @InjectMocks
    private CashbookQueryService service;

    @Test
    void hangsEachEntrysKhataMovementOnItsCashRow()
    {
        // A 5,000 sale that took 2,000 in cash, then the customer clearing 1,500 of the rest.
        TransactionLine sale = cashRow("t1", TransactionEvent.SALE, InOut.IN, 2000.0);
        TransactionLine receipt = cashRow("t2", TransactionEvent.RECEIPT, InOut.IN, 1500.0);
        seedRange(List.of(sale, receipt));
        when(transactionLineRepository.sumPartyNetByTransactionInRange(STORE, DAY, DAY))
                .thenReturn(List.of(net("t1", 3000.0), net("t2", -1500.0)));

        CashbookDayResponse res = service.getRange(STORE, DAY, DAY);

        assertEquals(3000.0, res.rows().getFirst().khata().amount());
        assertEquals(BalanceDirection.THEY_OWE_YOU, res.rows().getFirst().khata().direction());
        assertEquals(1500.0, res.rows().getLast().khata().amount());
        assertEquals(BalanceDirection.YOU_OWE_THEM, res.rows().getLast().khata().direction());

        // Netted: 3,000 went on the khata and 1,500 came back off it.
        assertEquals(1500.0, res.totalKhata().amount());
        assertEquals(BalanceDirection.THEY_OWE_YOU, res.totalKhata().direction());
    }

    @Test
    void leavesAnEntryThatTouchesNoPartySettled()
    {
        seedRange(List.of(cashRow("t1", TransactionEvent.EXPENSE, InOut.OUT, 300.0)));
        when(transactionLineRepository.sumPartyNetByTransactionInRange(STORE, DAY, DAY))
                .thenReturn(List.of());

        CashbookDayResponse res = service.getRange(STORE, DAY, DAY);

        assertEquals(BalanceDirection.SETTLED, res.rows().getFirst().khata().direction());
        assertEquals(BalanceDirection.SETTLED, res.totalKhata().direction());
    }

    private void seedRange(List<TransactionLine> lines)
    {
        when(transactionLineRepository.sumCashBefore(STORE, DAY)).thenReturn(0.0);
        when(transactionLineRepository.findCashLinesInRange(STORE, DAY, DAY)).thenReturn(lines);
        when(transactionRepository.findFirstByStoreIdAndEvent(STORE, TransactionEvent.OPENING_CASH))
                .thenReturn(Optional.empty());
    }

    private TransactionLine cashRow(String id, TransactionEvent event, InOut inOut, double value)
    {
        Transaction t = Transaction.builder().id(id).event(event).entryDate(DAY).build();
        TransactionLine line = TransactionLine.builder()
                .transaction(t).targetKind(TargetKind.CASH).inOut(inOut).value(value).build();
        t.getLines().add(line);
        return line;
    }

    private TransactionLineRepository.TransactionPartyNetRow net(String transactionId, double value)
    {
        return new TransactionLineRepository.TransactionPartyNetRow()
        {
            @Override
            public String getTransactionId()
            {
                return transactionId;
            }

            @Override
            public Double getNet()
            {
                return value;
            }
        };
    }
}
