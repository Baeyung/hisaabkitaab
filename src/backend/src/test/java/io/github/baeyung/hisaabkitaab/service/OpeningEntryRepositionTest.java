package io.github.baeyung.hisaabkitaab.service;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import jakarta.persistence.EntityManager;

import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;

/**
 * Covers the bug this whole feature exists for: a shopkeeper backdates a real
 * transaction to before an opening entry that was already set, and nothing
 * re-dates the opening entry on that write path. {@link OpeningEntryService#repositionOpeningEntries}
 * is the nightly catch-up for exactly that; wired directly against real repositories here
 * (not through Spring) since it needs no collaborators beyond them.
 */
@DataJpaTest(properties = {
        "spring.test.database.replace=none",
        "spring.datasource.url=jdbc:h2:mem:hkreposition;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
class OpeningEntryRepositionTest
{
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
    @Autowired
    private EntityManager entityManager;

    private OpeningEntryService openingEntryService;
    private Store store;
    private Party rana;
    private StoreItem lawn;

    @BeforeEach
    void seed()
    {
        openingEntryService = new OpeningEntryService(
                mock(PartyService.class), mock(StoreItemService.class), transactionRepository, transactionLineRepository);

        User owner = userRepository.save(
                User.builder().contactNumber("03001234567").passwordHash("x").name("Owner").build());
        store = storeRepository.save(Store.builder().owner(owner).name("Kapra Ghar").build());
        rana = partyRepository.save(Party.builder().store(store).name("Rana").build());
        lawn = storeItemRepository.save(StoreItem.builder().store(store).name("Lawn Print").unit("gz").build());
    }

    private Transaction openingBalance(LocalDate entryDate)
    {
        Transaction t = Transaction.builder()
                .store(store).event(TransactionEvent.OPENING_BALANCE).party(rana).entryDate(entryDate).build();
        t.getLines().add(TransactionLine.builder()
                .transaction(t).targetKind(TargetKind.PARTY).inOut(InOut.IN).value(5000.0).party(rana).build());
        return transactionRepository.save(t);
    }

    private Transaction openingStock(LocalDate entryDate)
    {
        Transaction t = Transaction.builder().store(store).event(TransactionEvent.OPENING_STOCK).entryDate(entryDate).build();
        t.getLines().add(TransactionLine.builder()
                .transaction(t).targetKind(TargetKind.STOCK).inOut(InOut.IN).quantity(new BigDecimal("50")).item(lawn).build());
        return transactionRepository.save(t);
    }

    private Transaction openingCash(LocalDate entryDate)
    {
        Transaction t = Transaction.builder().store(store).event(TransactionEvent.OPENING_CASH).entryDate(entryDate).build();
        t.getLines().add(TransactionLine.builder()
                .transaction(t).targetKind(TargetKind.CASH).inOut(InOut.IN).value(3000.0).build());
        return transactionRepository.save(t);
    }

    /** A real purchase against the party, backdated ahead of an opening entry already sat at "today". */
    private void backdatedPartyPurchase(LocalDate eventDate)
    {
        Transaction t = Transaction.builder().store(store).event(TransactionEvent.PURCHASE).party(rana).entryDate(eventDate).build();
        t.getLines().add(TransactionLine.builder()
                .transaction(t).targetKind(TargetKind.PARTY).inOut(InOut.OUT).value(1000.0).party(rana).build());
        transactionRepository.save(t);
    }

    private void backdatedStockPurchase(LocalDate eventDate)
    {
        Transaction t = Transaction.builder().store(store).event(TransactionEvent.PURCHASE).entryDate(eventDate).build();
        t.getLines().add(TransactionLine.builder()
                .transaction(t).targetKind(TargetKind.STOCK).inOut(InOut.IN).quantity(new BigDecimal("10")).item(lawn).build());
        transactionRepository.save(t);
    }

    private void flush()
    {
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void movesPartyOpeningBalanceEarlierWhenBackdatedPurchaseArrives()
    {
        LocalDate today = LocalDate.now();
        LocalDate earlier = today.minusDays(30);
        openingBalance(today);
        backdatedPartyPurchase(earlier);
        flush();

        openingEntryService.repositionOpeningEntries(storeRepository.findById(store.getId()).orElseThrow());
        flush();

        Transaction opening = transactionRepository
                .findFirstByStoreIdAndEventAndPartyId(store.getId(), TransactionEvent.OPENING_BALANCE, rana.getId())
                .orElseThrow();
        assertEquals(earlier, opening.getEntryDate());
    }

    @Test
    void movesItemOpeningStockEarlierWhenBackdatedPurchaseArrives()
    {
        LocalDate today = LocalDate.now();
        LocalDate earlier = today.minusDays(10);
        openingStock(today);
        backdatedStockPurchase(earlier);
        flush();

        openingEntryService.repositionOpeningEntries(storeRepository.findById(store.getId()).orElseThrow());
        flush();

        Transaction opening = transactionRepository
                .findFirstByStoreIdAndEventAndLinesItemId(store.getId(), TransactionEvent.OPENING_STOCK, lawn.getId())
                .orElseThrow();
        assertEquals(earlier, opening.getEntryDate());
    }

    @Test
    void movesOpeningCashEarlierWhenAnyBackdatedTransactionArrives()
    {
        LocalDate today = LocalDate.now();
        LocalDate earlier = today.minusDays(5);
        openingCash(today);
        backdatedPartyPurchase(earlier);
        flush();

        openingEntryService.repositionOpeningEntries(storeRepository.findById(store.getId()).orElseThrow());
        flush();

        Transaction opening = transactionRepository.findFirstByStoreIdAndEvent(store.getId(), TransactionEvent.OPENING_CASH).orElseThrow();
        assertEquals(earlier, opening.getEntryDate());
    }

    @Test
    void leavesOpeningEntryAloneWhenAlreadyEarliest()
    {
        LocalDate openedOn = LocalDate.now().minusDays(60);
        openingBalance(openedOn);
        backdatedPartyPurchase(openedOn.plusDays(5));
        flush();

        openingEntryService.repositionOpeningEntries(storeRepository.findById(store.getId()).orElseThrow());
        flush();

        Transaction opening = transactionRepository
                .findFirstByStoreIdAndEventAndPartyId(store.getId(), TransactionEvent.OPENING_BALANCE, rana.getId())
                .orElseThrow();
        assertEquals(openedOn, opening.getEntryDate());
    }

    @Test
    void earliestPartyDateExcludesTheOpeningBalanceItself()
    {
        openingBalance(LocalDate.now().minusDays(100));
        flush();

        assertNull(transactionLineRepository.findEarliestPartyDate(rana.getId(), store.getId()));
    }

    @Test
    void earliestItemDateExcludesTheOpeningStockItself()
    {
        openingStock(LocalDate.now().minusDays(100));
        flush();

        assertNull(transactionLineRepository.findEarliestItemDate(lawn.getId(), store.getId()));
    }
}
