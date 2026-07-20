package io.github.baeyung.hisaabkitaab.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

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
    private final StoreService storeService;
    private final PartyService partyService;
    private final StoreItemService storeItemService;
    private final TransactionRepository transactionRepository;
    private final TransactionLineRepository transactionLineRepository;

    /** Current opening balance per party for the owner's store — keyed by party id, absent when none set. */
    @Transactional(readOnly = true)
    public Map<String, PartyBalance> openingBalancesByOwner(String ownerId)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        return transactionLineRepository.findOpeningBalancesByStore(store.getId()).stream()
                .collect(Collectors.toMap(
                        TransactionLineRepository.PartyOpeningRow::getPartyId,
                        row -> {
                            double value = row.getValue() != null ? row.getValue() : 0;
                            return PartyBalance.of(row.getInOut() == InOut.IN ? value : -value);
                        }));
    }

    /** Current opening stock per item for the owner's store — keyed by item id, absent when none set. */
    @Transactional(readOnly = true)
    public Map<String, BigDecimal> openingStockByOwner(String ownerId)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        return transactionLineRepository.findOpeningStockByStore(store.getId()).stream()
                .collect(Collectors.toMap(
                        TransactionLineRepository.ItemOpeningRow::getItemId,
                        TransactionLineRepository.ItemOpeningRow::getQuantity));
    }

    public PartyBalance setOpeningBalance(String partyId, String ownerId, double amount, BalanceDirection direction)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        Party party = partyService.findByIdForOwner(partyId, ownerId);

        Optional<Transaction> existing =
                transactionRepository.findFirstByStoreIdAndEventAndPartyId(store.getId(), TransactionEvent.OPENING_BALANCE, partyId);

        if (amount <= 0)
        {
            existing.ifPresent(transactionRepository::delete);
            return PartyBalance.of(0);
        }

        InOut inOut = direction == BalanceDirection.YOU_OWE_THEM ? InOut.OUT : InOut.IN;

        if (existing.isPresent())
        {
            TransactionLine line = existing.get().getLines().getFirst();
            line.setValue(amount);
            line.setInOut(inOut);
            transactionRepository.save(existing.get());
        }
        else
        {
            Transaction transaction = Transaction.builder()
                    .store(store)
                    .event(TransactionEvent.OPENING_BALANCE)
                    .party(party)
                    .entryDate(LocalDate.now())
                    .description("Opening balance for " + party.getName())
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

        return PartyBalance.of(inOut == InOut.IN ? amount : -amount);
    }

    /** Current opening drawer (cash) balance for the owner's store — 0 when none set. */
    @Transactional(readOnly = true)
    public double openingCashByOwner(String ownerId)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        return transactionRepository.findFirstByStoreIdAndEvent(store.getId(), TransactionEvent.OPENING_CASH)
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
    public double setOpeningCash(String ownerId, double amount)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);

        Optional<Transaction> existing =
                transactionRepository.findFirstByStoreIdAndEvent(store.getId(), TransactionEvent.OPENING_CASH);

        if (amount <= 0)
        {
            existing.ifPresent(transactionRepository::delete);
            return 0;
        }

        if (existing.isPresent())
        {
            existing.get().getLines().getFirst().setValue(amount);
            transactionRepository.save(existing.get());
        }
        else
        {
            // Date it at the store's first activity so it always sorts before real cash
            // movements (folding into the cashbook opening); today if it has none yet.
            LocalDate earliest = transactionRepository.findEarliestEntryDate(store.getId());
            LocalDate openedOn = earliest != null ? earliest : LocalDate.now();
            Transaction transaction = Transaction.builder()
                    .store(store)
                    .event(TransactionEvent.OPENING_CASH)
                    .entryDate(openedOn)
                    .description("Opening drawer balance")
                    .build();
            transaction.getLines().add(TransactionLine.builder()
                    .transaction(transaction)
                    .targetKind(TargetKind.CASH)
                    .inOut(InOut.IN)
                    .value(amount)
                    .build());
            transactionRepository.save(transaction);
        }

        return amount;
    }

    public BigDecimal setOpeningStock(String itemId, String ownerId, BigDecimal quantity)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        StoreItem item = storeItemService.findByIdForOwner(itemId, ownerId);

        Optional<Transaction> existing =
                transactionRepository.findFirstByStoreIdAndEventAndLinesItemId(store.getId(), TransactionEvent.OPENING_STOCK, itemId);

        if (quantity == null || quantity.signum() <= 0)
        {
            existing.ifPresent(transactionRepository::delete);
            return BigDecimal.ZERO;
        }

        if (existing.isPresent())
        {
            existing.get().getLines().getFirst().setQuantity(quantity);
            transactionRepository.save(existing.get());
        }
        else
        {
            Transaction transaction = Transaction.builder()
                    .store(store)
                    .event(TransactionEvent.OPENING_STOCK)
                    .entryDate(LocalDate.now())
                    .description("Opening stock " + item.getName())
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

        return quantity;
    }
}
