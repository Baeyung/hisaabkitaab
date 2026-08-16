package io.github.baeyung.hisaabkitaab.service.query;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillDetailResponse;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillLineResponse;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillSummaryResponse;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Goods documents: a transaction with stock lines read back as the paper it stands
 * for — a SALE as the bill you handed the customer, a PURCHASE as the record of what
 * a supplier delivered. Both sides answer the same questions (what moved, what cash
 * changed hands, what is still owed), so they share one shape: {@code cashReceived}
 * is cash paid out on a purchase, and {@code outstanding} runs the other way.
 *
 * Amounts are recomputed as Σ(quantity × rate) over the STOCK lines — the same number
 * the entry screen showed — because a STOCK line's {@code value} only repeats the
 * transaction's cash amount.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TransactionQueryService
{
    private final TransactionRepository transactionRepository;

    public List<BillSummaryResponse> list(String storeId, TransactionEvent event, String partyId, String itemId)
    {
        return transactionRepository
                .findBillsFiltered(storeId, event, blankToNull(partyId), blankToNull(itemId))
                .stream()
                .map(transaction -> new BillSummaryResponse(
                        transaction.getId(),
                        transaction.getBill(),
                        dateOf(transaction),
                        transaction.getParty() != null ? transaction.getParty().getName() : null,
                        goodsTotal(transaction),
                        outstanding(transaction)
                ))
                .toList();
    }

    public BillDetailResponse getDetail(String storeId, TransactionEvent event, String transactionId)
    {
        // Scoped by store id, and an id of the wrong event is "not found" — a purchase is not
        // a bill, so asking the bills endpoint for one gets the same answer as asking for junk.
        Transaction transaction = transactionRepository.findByIdAndStoreId(transactionId, storeId)
                .filter(t -> t.getEvent() == event)
                .orElseThrow(() -> ResourceNotFoundException.forEntity(label(event), transactionId));

        return toBillDetail(transaction);
    }

    /**
     * Details for many documents in one round-trip — the "print all" printout. Ids that aren't
     * this event's documents in this store are silently dropped; the result keeps the caller's
     * id order so the pages print in the order the list showed them.
     */
    public List<BillDetailResponse> getDetails(String storeId, TransactionEvent event, List<String> transactionIds)
    {
        if (transactionIds == null || transactionIds.isEmpty())
        {
            return List.of();
        }

        Map<String, Transaction> byId = transactionRepository.findByIdInAndStoreId(transactionIds, storeId)
                .stream()
                .filter(t -> t.getEvent() == event)
                .collect(Collectors.toMap(Transaction::getId, t -> t));

        return transactionIds.stream()
                .map(byId::get)
                .filter(Objects::nonNull)
                .map(this::toBillDetail)
                .toList();
    }

    /** What a missing document is called in its 404 — "Bill not found" reads wrong for a purchase. */
    private static String label(TransactionEvent event)
    {
        return event == TransactionEvent.PURCHASE ? "Purchase" : "Bill";
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

        return new BillDetailResponse(
                transaction.getId(),
                transaction.getBill(),
                dateOf(transaction),
                transaction.getDescription(),
                transaction.getParty() != null ? transaction.getParty().getId() : null,
                transaction.getParty() != null ? transaction.getParty().getName() : null,
                transaction.getParty() != null ? transaction.getParty().getContact() : null,
                lines,
                goodsTotal,
                cashReceived,
                outstanding(transaction)
        );
    }

    /**
     * What the document left on its party's khata: Σ IN − Σ OUT over its PARTY lines,
     * turned into an amount plus a direction. Shared by the list and the detail so the
     * "on khata" column and the document itself can never disagree.
     */
    private PartyBalance outstanding(Transaction transaction)
    {
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

        return PartyBalance.of(partyNet);
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
