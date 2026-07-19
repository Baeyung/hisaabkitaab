package io.github.baeyung.hisaabkitaab.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository.ItemStockRow;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository.PartyBalanceRow;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * First CASE-WHEN aggregation queries in the codebase — verifies the sums match
 * hand computation over a seeded SALE (part-udhaar) + RECEIPT sequence.
 */
// H2 in PostgreSQL mode: the entities use Postgres-isms (a `text` column definition) and
// TransactionLine.value collides with H2's VALUE keyword, hence NON_KEYWORDS.
@DataJpaTest(properties = {
        "spring.test.database.replace=none",
        "spring.datasource.url=jdbc:h2:mem:hk;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class TransactionLineAggregationTest
{
    private static final LocalDate YESTERDAY = LocalDate.of(2026, 7, 16);
    private static final LocalDate TODAY = LocalDate.of(2026, 7, 17);

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private StoreRepository storeRepository;
    @Autowired
    private PartyRepository partyRepository;
    @Autowired
    private StoreItemRepository storeItemRepository;
    @Autowired
    private TransactionRepository transactionRepository;
    @Autowired
    private TransactionLineRepository transactionLineRepository;

    private Store store;
    private Party rana;
    private StoreItem lawn;

    @BeforeEach
    void seed()
    {
        User owner = userRepository.save(
                User.builder().contactNumber("03001234567").passwordHash("x").name("Owner").build());
        store = storeRepository.save(Store.builder().owner(owner).name("Kapra Ghar").build());
        rana = partyRepository.save(Party.builder().store(store).name("Rana").build());
        lawn = storeItemRepository.save(StoreItem.builder().store(store).name("Lawn Print").unit("gz").build());

        // Yesterday's SALE to Rana: bill 7,000, cash 5,000 → udhaar 2,000.
        Transaction sale = transaction(TransactionEvent.SALE, YESTERDAY);
        line(sale, TargetKind.CASH, InOut.IN, 5000.0, null, null);
        line(sale, TargetKind.PARTY, InOut.IN, 2000.0, rana, null);
        line(sale, TargetKind.STOCK, InOut.OUT, 5000.0, rana, new BigDecimal("12"));

        // Today's RECEIPT: Rana pays 1,500 off the udhaar.
        Transaction receipt = transaction(TransactionEvent.RECEIPT, TODAY);
        line(receipt, TargetKind.CASH, InOut.IN, 1500.0, null, null);
        line(receipt, TargetKind.PARTY, InOut.OUT, 1500.0, rana, null);
    }

    @Test
    void cashBeforeTodayIsYesterdaysCashLine()
    {
        assertEquals(5000.0, transactionLineRepository.sumCashBefore(store.getId(), TODAY));
    }

    @Test
    void partyBalanceIsInMinusOut()
    {
        Map<String, Double> balances = transactionLineRepository.sumPartyBalancesByStore(store.getId())
                .stream()
                .collect(Collectors.toMap(PartyBalanceRow::getPartyId, PartyBalanceRow::getBalance));

        // 2,000 udhaar − 1,500 received = Rana still owes 500.
        assertEquals(500.0, balances.get(rana.getId()));
    }

    @Test
    void stockIsInMinusOutOfQuantities()
    {
        Map<String, BigDecimal> stock = transactionLineRepository.sumStockByStore(store.getId())
                .stream()
                .collect(Collectors.toMap(ItemStockRow::getItemId, ItemStockRow::getStock));

        assertEquals(0, new BigDecimal("-12").compareTo(stock.get(lawn.getId())));
    }

    @Test
    void cashLinesForDayFetchesOnlyThatDay()
    {
        List<TransactionLine> lines = transactionLineRepository.findCashLinesInRange(store.getId(), TODAY, TODAY);

        assertEquals(1, lines.size());
        assertEquals(1500.0, lines.getFirst().getValue());
    }

    @Test
    void expenseLinesAreOnlyExpenseCashOut()
    {
        // Two bijli expenses + one chai, plus the seeded SALE/RECEIPT cash lines that must be excluded.
        expense("Bijli", 900.0, YESTERDAY);
        expense("Bijli", 1100.0, TODAY);
        expense("Chai", 50.0, TODAY);

        List<TransactionLine> lines = transactionLineRepository.findExpenseLinesByStore(store.getId());

        // Only the three EXPENSE cash lines, chronological — the SALE's CASH/IN is not one.
        assertEquals(List.of(900.0, 1100.0, 50.0), lines.stream().map(TransactionLine::getValue).toList());
    }

    private void expense(String description, Double amount, LocalDate eventDate)
    {
        Transaction expense = transactionRepository.save(Transaction.builder()
                .store(store)
                .event(TransactionEvent.EXPENSE)
                .eventDate(eventDate)
                .entryDate(TODAY)
                .description(description)
                .build());
        line(expense, TargetKind.CASH, InOut.OUT, amount, null, null);
    }

    private Transaction transaction(TransactionEvent event, LocalDate eventDate)
    {
        return transactionRepository.save(Transaction.builder()
                .store(store)
                .event(event)
                .party(rana)
                .eventDate(eventDate)
                .entryDate(TODAY)
                .build());
    }

    private void line(
            Transaction transaction,
            TargetKind kind,
            InOut inOut,
            Double value,
            Party party,
            BigDecimal quantity
    )
    {
        transactionLineRepository.save(TransactionLine.builder()
                .transaction(transaction)
                .targetKind(kind)
                .inOut(inOut)
                .value(value)
                .party(party)
                .item(kind == TargetKind.STOCK ? lawn : null)
                .quantity(quantity)
                .build());
    }
}
