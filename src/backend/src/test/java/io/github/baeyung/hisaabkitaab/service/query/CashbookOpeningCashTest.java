package io.github.baeyung.hisaabkitaab.service.query;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import io.github.baeyung.hisaabkitaab.dto.cashbook.CashbookDayResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.StoreService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

/**
 * The opening drawer balance is a baseline dated at the store's opening. When the
 * cashbook window starts on or before that date, sumCashBefore misses it — so it must
 * be folded into the opening figure and dropped from the movement rows (never lost,
 * never double-counted).
 */
@ExtendWith(MockitoExtension.class)
class CashbookOpeningCashTest
{
    private static final String OWNER = "owner";
    private static final LocalDate OPENED_ON = LocalDate.of(2026, 1, 10);

    @Mock
    private StoreService storeService;
    @Mock
    private TransactionLineRepository transactionLineRepository;
    @Mock
    private TransactionRepository transactionRepository;
    @InjectMocks
    private CashbookQueryService service;

    @Test
    void foldsDrawerIntoOpeningWhenWindowStartsBeforeStoreOpened()
    {
        LocalDate from = LocalDate.of(2026, 1, 1); // before the store existed
        LocalDate to = LocalDate.of(2026, 1, 31);
        Store store = seedStore();

        // sumCashBefore misses the drawer (it's dated on/after `from`); the range query
        // still surfaces the opening-cash line as a row alongside a real sale.
        when(transactionLineRepository.sumCashBefore("s1", from)).thenReturn(0.0);
        when(transactionLineRepository.findCashLinesInRange("s1", from, to))
                .thenReturn(List.of(cashRow(TransactionEvent.OPENING_CASH, InOut.IN, 3000.0),
                                    cashRow(TransactionEvent.SALE, InOut.IN, 1000.0)));

        CashbookDayResponse res = service.getRange(OWNER, from, to);

        assertEquals(3000.0, res.openingBalance());          // drawer folded into opening
        assertEquals(1, res.rows().size());                  // opening-cash row dropped
        assertEquals(1000.0, res.totalIn());                 // only the real movement
        assertEquals(4000.0, res.closingBalance());          // 3000 opening + 1000 sale
    }

    @Test
    void doesNotDoubleCountWhenWindowStartsAfterStoreOpened()
    {
        LocalDate from = LocalDate.of(2026, 1, 20); // after the store opened
        LocalDate to = LocalDate.of(2026, 1, 31);
        seedStore();

        // Here sumCashBefore already includes the drawer by date, and the opening-cash
        // line is out of the window — nothing to fold.
        when(transactionLineRepository.sumCashBefore("s1", from)).thenReturn(3000.0);
        when(transactionLineRepository.findCashLinesInRange("s1", from, to)).thenReturn(List.of());

        CashbookDayResponse res = service.getRange(OWNER, from, to);

        assertEquals(3000.0, res.openingBalance());
        assertEquals(3000.0, res.closingBalance());
    }

    private Store seedStore()
    {
        Store store = Store.builder().id("s1").build();
        when(storeService.getPrimaryStoreForOwner(OWNER)).thenReturn(store);

        Transaction openingCash = Transaction.builder()
                .event(TransactionEvent.OPENING_CASH).entryDate(OPENED_ON).build();
        openingCash.getLines().add(TransactionLine.builder()
                .transaction(openingCash).targetKind(TargetKind.CASH).inOut(InOut.IN).value(3000.0).build());
        when(transactionRepository.findFirstByStoreIdAndEvent("s1", TransactionEvent.OPENING_CASH))
                .thenReturn(java.util.Optional.of(openingCash));
        return store;
    }

    private TransactionLine cashRow(TransactionEvent event, InOut inOut, double value)
    {
        Transaction t = Transaction.builder().event(event).entryDate(OPENED_ON).build();
        TransactionLine line = TransactionLine.builder()
                .transaction(t).targetKind(TargetKind.CASH).inOut(inOut).value(value).build();
        t.getLines().add(line);
        return line;
    }
}
