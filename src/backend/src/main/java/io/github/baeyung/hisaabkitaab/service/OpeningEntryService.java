package io.github.baeyung.hisaabkitaab.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.common.BalanceDirection;
import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;

/**
 * Opening balances and opening stock: the receivable a party carried in, or the
 * goods on hand, at onboarding. Each is a single-sided transaction — one PARTY or
 * STOCK line with no cash counterpart — that the derived read side (ledger,
 * inventory) folds in like any other. There is at most one per party/item, so
 * setting again edits it in place; setting zero clears it.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class OpeningEntryService
{
    private static final Logger log = LoggerFactory.getLogger(OpeningEntryService.class);

    private final PartyService partyService;
    private final StoreItemService storeItemService;
    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;

    /** Current opening balance per party in the store — keyed by party id, absent when none set. */
    @Transactional(readOnly = true)
    public Map<String, PartyBalance> openingBalancesByStore(String storeId)
    {
        return transactionLineRepository.findOpeningBalancesByStore(storeId).stream()
                .collect(Collectors.toMap(
                        TransactionLineRepository.PartyOpeningRow::getPartyId,
                        row -> {
                            double value = row.getValue() != null ? row.getValue() : 0;
                            return PartyBalance.of(row.getInOut() == InOut.IN ? value : -value);
                        }));
    }

    /** Current opening stock per item in the store — keyed by item id, absent when none set. */
    @Transactional(readOnly = true)
    public Map<String, BigDecimal> openingStockByStore(String storeId)
    {
        return transactionLineRepository.findOpeningStockByStore(storeId).stream()
                .collect(Collectors.toMap(
                        TransactionLineRepository.ItemOpeningRow::getItemId,
                        TransactionLineRepository.ItemOpeningRow::getQuantity));
    }

    public PartyBalance setOpeningBalance(String partyId, Store store, double amount, BalanceDirection direction)
    {
        Party party = partyService.findByIdForStore(partyId, store.getId());

        Optional<Transaction> existing =
                transactionRepository.findFirstByStoreIdAndEventAndPartyId(store.getId(), TransactionEvent.OPENING_BALANCE, partyId);

        if (amount <= 0)
        {
            // A zero is a clear, not a no-op, and it silently removes an entry. Said out loud
            // because "the opening balance disappeared" has no other explanation in the log.
            log.info("clearing opening balance of party {} in store {} (was {})",
                    partyId, store.getId(), existing.isPresent() ? "set" : "unset");
            existing.ifPresent(transactionRepository::delete);
            return PartyBalance.of(0);
        }

        InOut inOut = direction == BalanceDirection.YOU_OWE_THEM ? InOut.OUT : InOut.IN;
        LocalDate openedOn = openingDate(transactionLineRepository.findEarliestPartyDate(partyId, store.getId()));

        if (existing.isPresent())
        {
            Transaction transaction = existing.get();
            TransactionLine line = transaction.getLines().getFirst();
            line.setValue(amount);
            line.setInOut(inOut);
            transaction.setEntryDate(openedOn);
            transactionRepository.save(transaction);
        }
        else
        {
            Transaction transaction = Transaction.builder()
                    .store(store)
                    .event(TransactionEvent.OPENING_BALANCE)
                    .party(party)
                    .entryDate(openedOn)
                    .build();
            transaction.getLines().add(TransactionLine.builder()
                    .transaction(transaction)
                    .targetKind(TargetKind.PARTY)
                    .party(party)
                    .inOut(inOut)
                    .value(amount)
                    .build());
            transactionRepository.save(transaction);
        }

        log.info("{} opening balance of party {} \"{}\" in store {} to {} {}",
                existing.isPresent() ? "updated" : "set", partyId, party.getName(),
                store.getId(), amount, inOut);

        return PartyBalance.of(inOut == InOut.IN ? amount : -amount);
    }

    /** Current opening drawer (cash) balance for the store — 0 when none set. */
    @Transactional(readOnly = true)
    public double openingCashByStore(String storeId)
    {
        return transactionRepository.findFirstByStoreIdAndEvent(storeId, TransactionEvent.OPENING_CASH)
                .map(t -> {
                    Double value = t.getLines().getFirst().getValue();
                    return value != null ? value : 0;
                })
                .orElse(0.0);
    }

    /**
     * Upsert the store's opening drawer balance: the cash on hand at onboarding.
     * A single CASH IN line the cashbook folds into its opening figure; dated at
     * store creation so it always sorts before real movements. Zero clears it.
     */
    public double setOpeningCash(Store store, double amount)
    {
        Optional<Transaction> existing =
                transactionRepository.findFirstByStoreIdAndEvent(store.getId(), TransactionEvent.OPENING_CASH);

        if (amount <= 0)
        {
            log.info("clearing opening cash of store {} (was {})",
                    store.getId(), existing.isPresent() ? "set" : "unset");
            existing.ifPresent(transactionRepository::delete);
            return 0;
        }

        // Date it at the store's first activity so it always sorts before real cash
        // movements (folding into the cashbook opening); today if it has none yet.
        LocalDate openedOn = openingDate(transactionRepository.findEarliestEntryDate(store.getId()));

        if (existing.isPresent())
        {
            Transaction transaction = existing.get();
            transaction.getLines().getFirst().setValue(amount);
            transaction.setEntryDate(openedOn);
            transactionRepository.save(transaction);
        }
        else
        {
            Transaction transaction = Transaction.builder()
                    .store(store)
                    .event(TransactionEvent.OPENING_CASH)
                    .entryDate(openedOn)
                    .build();
            transaction.getLines().add(TransactionLine.builder()
                    .transaction(transaction)
                    .targetKind(TargetKind.CASH)
                    .inOut(InOut.IN)
                    .value(amount)
                    .build());
            transactionRepository.save(transaction);
        }

        log.info("{} opening cash of store {} to {}",
                existing.isPresent() ? "updated" : "set", store.getId(), amount);

        return amount;
    }

    public BigDecimal setOpeningStock(String itemId, Store store, BigDecimal quantity)
    {
        StoreItem item = storeItemService.findByIdForStore(itemId, store.getId());

        Optional<Transaction> existing =
                transactionRepository.findFirstByStoreIdAndEventAndLinesItemId(store.getId(), TransactionEvent.OPENING_STOCK, itemId);

        if (quantity == null || quantity.signum() <= 0)
        {
            log.info("clearing opening stock of item {} in store {} (was {})",
                    itemId, store.getId(), existing.isPresent() ? "set" : "unset");
            existing.ifPresent(transactionRepository::delete);
            return BigDecimal.ZERO;
        }

        LocalDate openedOn = openingDate(transactionLineRepository.findEarliestItemDate(itemId, store.getId()));

        if (existing.isPresent())
        {
            Transaction transaction = existing.get();
            transaction.getLines().getFirst().setQuantity(quantity);
            transaction.setEntryDate(openedOn);
            transactionRepository.save(transaction);
        }
        else
        {
            Transaction transaction = Transaction.builder()
                    .store(store)
                    .event(TransactionEvent.OPENING_STOCK)
                    .entryDate(openedOn)
                    .build();
            transaction.getLines().add(TransactionLine.builder()
                    .transaction(transaction)
                    .targetKind(TargetKind.STOCK)
                    .item(item)
                    .inOut(InOut.IN)
                    .quantity(quantity)
                    .unit(item.getUnit())
                    .build());
            transactionRepository.save(transaction);
        }

        log.info("{} opening stock of item {} \"{}\" in store {} to {} {}",
                existing.isPresent() ? "updated" : "set", itemId, item.getName(),
                store.getId(), quantity, item.getUnit());

        return quantity;
    }

    /**
     * Nightly safety net for the store's opening entries. Setting an opening balance/stock
     * already dates it at the earliest real activity known at that moment — but a shopkeeper
     * can add an even earlier backdated sale, purchase, or receipt afterwards without ever
     * touching Settings again, which nothing else re-dates. This walks every existing opening
     * entry and moves it earlier if real activity now starts before it; it never creates one
     * that was never set, and it's a no-op (no write) once nothing is left to correct.
     */
    public void repositionOpeningEntries(Store store)
    {
        String storeId = store.getId();

        Map<String, LocalDate> partyDates = transactionLineRepository.findEarliestPartyDatesByStore(storeId).stream()
                .collect(Collectors.toMap(TransactionLineRepository.PartyEarliestRow::getPartyId,
                        TransactionLineRepository.PartyEarliestRow::getEarliestDate));
        for (Transaction opening : transactionRepository.findByStoreAndEventNewestFirst(storeId, TransactionEvent.OPENING_BALANCE))
        {
            repositionIfEarlier(opening, partyDates.get(opening.getParty().getId()));
        }

        Map<String, LocalDate> itemDates = transactionLineRepository.findEarliestItemDatesByStore(storeId).stream()
                .collect(Collectors.toMap(TransactionLineRepository.ItemEarliestRow::getItemId,
                        TransactionLineRepository.ItemEarliestRow::getEarliestDate));
        for (Transaction opening : transactionRepository.findByStoreAndEventNewestFirst(storeId, TransactionEvent.OPENING_STOCK))
        {
            repositionIfEarlier(opening, itemDates.get(opening.getLines().getFirst().getItem().getId()));
        }

        transactionRepository.findFirstByStoreIdAndEvent(storeId, TransactionEvent.OPENING_CASH)
                .ifPresent(opening -> repositionIfEarlier(opening, transactionRepository.findEarliestEntryDate(storeId)));
    }

    /** Moves an opening transaction's date to {@code earliest} only when that's actually earlier than what it has now. */
    private void repositionIfEarlier(Transaction opening, LocalDate earliest)
    {
        if (earliest == null || !earliest.isBefore(opening.getEntryDate()))
        {
            return;
        }

        log.info("repositioning {} of store {} from {} to {}",
                opening.getEvent(), opening.getStore().getId(), opening.getEntryDate(), earliest);
        opening.setEntryDate(earliest);
        transactionRepository.save(opening);
    }

    /** Today's earliest known real activity, or right now when there is none yet. */
    private static LocalDate openingDate(LocalDate earliest)
    {
        return earliest != null ? earliest : LocalDate.now();
    }
}
