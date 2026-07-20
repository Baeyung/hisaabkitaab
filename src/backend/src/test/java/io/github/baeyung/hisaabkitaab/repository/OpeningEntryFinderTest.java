package io.github.baeyung.hisaabkitaab.repository;

import java.time.LocalDate;
import java.util.Optional;

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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The opening-entry upsert finders (OpeningEntryService): find the single opening
 * transaction for a party (by event + party) or an item (by event + line item).
 * Verifies the derived queries resolve — the item one traverses the lines collection.
 */
@DataJpaTest(properties = {
        "spring.test.database.replace=none",
        "spring.datasource.url=jdbc:h2:mem:hkopen;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=VALUE",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class OpeningEntryFinderTest
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
    private EntityManager entityManager;

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

        // Seed the way OpeningEntryService does: the line hangs off the transaction's
        // collection and persists by cascade, so the @EntityGraph finder can fetch it.
        Transaction opening = Transaction.builder()
                .store(store).event(TransactionEvent.OPENING_BALANCE).party(rana)
                .entryDate(LocalDate.now()).build();
        opening.getLines().add(TransactionLine.builder()
                .transaction(opening).targetKind(TargetKind.PARTY).inOut(InOut.IN).value(5000.0).party(rana).build());
        transactionRepository.save(opening);

        Transaction stock = Transaction.builder()
                .store(store).event(TransactionEvent.OPENING_STOCK)
                .entryDate(LocalDate.now()).build();
        stock.getLines().add(TransactionLine.builder()
                .transaction(stock).targetKind(TargetKind.STOCK).inOut(InOut.IN)
                .quantity(new java.math.BigDecimal("50")).item(lawn).build());
        transactionRepository.save(stock);

        Transaction cash = Transaction.builder()
                .store(store).event(TransactionEvent.OPENING_CASH)
                .entryDate(LocalDate.now()).build();
        cash.getLines().add(TransactionLine.builder()
                .transaction(cash).targetKind(TargetKind.CASH).inOut(InOut.IN).value(3000.0).build());
        transactionRepository.save(cash);

        // Force the finders to read from the DB (fresh context), as a real request would.
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void findsPartyOpeningBalance()
    {
        Optional<Transaction> found = transactionRepository
                .findFirstByStoreIdAndEventAndPartyId(store.getId(), TransactionEvent.OPENING_BALANCE, rana.getId());

        assertTrue(found.isPresent());
        assertEquals(5000.0, found.get().getLines().getFirst().getValue());
    }

    @Test
    void findsItemOpeningStockByLineItem()
    {
        Optional<Transaction> found = transactionRepository
                .findFirstByStoreIdAndEventAndLinesItemId(store.getId(), TransactionEvent.OPENING_STOCK, lawn.getId());

        assertTrue(found.isPresent());
        assertEquals(0, new java.math.BigDecimal("50").compareTo(found.get().getLines().getFirst().getQuantity()));
    }

    @Test
    void findsStoreOpeningCash()
    {
        Optional<Transaction> found = transactionRepository
                .findFirstByStoreIdAndEvent(store.getId(), TransactionEvent.OPENING_CASH);

        assertTrue(found.isPresent());
        assertEquals(3000.0, found.get().getLines().getFirst().getValue());
    }

    @Test
    void absentWhenNoOpeningForParty()
    {
        Party other = partyRepository.save(Party.builder().store(store).name("Bilal").build());

        assertTrue(transactionRepository
                .findFirstByStoreIdAndEventAndPartyId(store.getId(), TransactionEvent.OPENING_BALANCE, other.getId())
                .isEmpty());
    }
}
