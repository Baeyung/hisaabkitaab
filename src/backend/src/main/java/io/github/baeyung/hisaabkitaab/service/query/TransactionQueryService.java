package io.github.baeyung.hisaabkitaab.service.query;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillDetailResponse;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillLineResponse;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillSummaryResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

/**
 * Bills, which are simply SALE transactions read back as invoices. Bill amounts
 * are recomputed as Σ(quantity × rate) over the STOCK lines — the same number
 * the entry screen showed — because a STOCK line's {@code value} only repeats
 * the transaction's cash amount.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TransactionQueryService
{
    private final StoreService storeService;
    private final TransactionRepository transactionRepository;

    public List<BillSummaryResponse> listBills(String ownerId, String partyId, String itemId)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);

        return transactionRepository
                .findBillsFiltered(store.getId(), TransactionEvent.SALE, blankToNull(partyId), blankToNull(itemId))
                .stream()
                .map(transaction -> new BillSummaryResponse(
                        transaction.getId(),
                        transaction.getBill(),
                        dateOf(transaction),
                        transaction.getParty() != null ? transaction.getParty().getName() : null,
                        goodsTotal(transaction)
                ))
                .toList();
    }

    public BillDetailResponse getBillDetail(String ownerId, String transactionId)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);

        // Scoped by store id, and a non-SALE id is "not found" — bills are only ever sales.
        Transaction transaction = transactionRepository.findByIdAndStoreId(transactionId, store.getId())
                .filter(t -> t.getEvent() == TransactionEvent.SALE)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Bill", transactionId));

        return toBillDetail(transaction);
    }

    /**
     * Details for many bills in one round-trip — the "print all bills" printout. Ids that aren't
     * SALE bills in this store are silently dropped; the result keeps the caller's id order so the
     * invoices print in the order the list showed them.
     */
    public List<BillDetailResponse> getBillDetails(String ownerId, List<String> transactionIds)
    {
        if (transactionIds == null || transactionIds.isEmpty())
        {
            return List.of();
        }

        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        Map<String, Transaction> byId = transactionRepository.findByIdInAndStoreId(transactionIds, store.getId())
                .stream()
                .filter(t -> t.getEvent() == TransactionEvent.SALE)
                .collect(Collectors.toMap(Transaction::getId, t -> t));

        return transactionIds.stream()
                .map(byId::get)
                .filter(Objects::nonNull)
                .map(this::toBillDetail)
                .toList();
    }

    private BillDetailResponse toBillDetail(Transaction transaction)
    {
        List<BillLineResponse> lines = transaction.getLines()
                .stream()
                .filter(line -> line.getTargetKind() == TargetKind.STOCK)
                .map(this::toBillLine)
                .toList();

        double goodsTotal = lines.stream().mapToDouble(BillLineResponse::amount).sum();

        double cashReceived = transaction.getLines()
                .stream()
                .filter(line -> line.getTargetKind() == TargetKind.CASH)
                .mapToDouble(this::value)
                .sum();

        double partyNet = transaction.getLines()
                .stream()
                .filter(line -> line.getTargetKind() == TargetKind.PARTY)
                .mapToDouble(line -> switch (line.getInOut())
                {
                    case IN -> value(line);
                    case OUT -> -value(line);
                    default -> 0;
                })
                .sum();

        return new BillDetailResponse(
                transaction.getId(),
                transaction.getBill(),
                dateOf(transaction),
                transaction.getDescription(),
                transaction.getParty() != null ? transaction.getParty().getName() : null,
                lines,
                goodsTotal,
                cashReceived,
                PartyBalance.of(partyNet)
        );
    }

    /** Same line math as the detail view, so the list amount can never disagree with the detail total. */
    private double goodsTotal(Transaction transaction)
    {
        return transaction.getLines()
                .stream()
                .filter(line -> line.getTargetKind() == TargetKind.STOCK)
                .map(this::toBillLine)
                .mapToDouble(BillLineResponse::amount)
                .sum();
    }

    private BillLineResponse toBillLine(TransactionLine line)
    {
        double rate = line.getItemSoldAt() != null ? line.getItemSoldAt() : 0;
        double quantity = line.getQuantity() != null ? line.getQuantity().doubleValue() : 0;
        boolean hasItem = line.getItem() != null;
        String unit = hasItem && line.getItem().getUnit() != null ? line.getItem().getUnit() : line.getUnit();

        return new BillLineResponse(
                hasItem ? line.getItem().getId() : null,
                hasItem ? line.getItem().getName() : null,
                line.getQuantity(),
                unit,
                rate,
                quantity * rate
        );
    }

    private double value(TransactionLine line)
    {
        return line.getValue() != null ? line.getValue() : 0;
    }

    private static String blankToNull(String value)
    {
        return value == null || value.isBlank() ? null : value;
    }

    private LocalDate dateOf(Transaction transaction)
    {
        return transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate();
    }
}
