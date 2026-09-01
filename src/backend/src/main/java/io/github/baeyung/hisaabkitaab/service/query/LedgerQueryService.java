package io.github.baeyung.hisaabkitaab.service.query;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.dto.ledger.*;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository.PartyBalanceRow;
import io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService;
import io.github.baeyung.hisaabkitaab.service.PartyService;
import io.github.baeyung.hisaabkitaab.service.query.support.DocumentTotals;
import io.github.baeyung.hisaabkitaab.service.query.support.ItemSummary;
import io.github.baeyung.hisaabkitaab.service.query.support.ReceivableAging;
import io.github.baeyung.hisaabkitaab.service.query.support.RunningBalanceFolder;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The khata: every party with its net balance and direction, and the per-party
 * running-balance statement. Balance = Σ(IN) − Σ(OUT) over PARTY lines;
 * positive means they owe the store (see PartyProcessor for the write side).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LedgerQueryService
{
    private static final Logger log = LoggerFactory.getLogger(LedgerQueryService.class);

    private final PartyService partyService;
    private final PartyRepository partyRepository;
    private final TransactionLineRepository transactionLineRepository;

    public List<PartyBalanceResponse> listBalances(String storeId)
    {
        Map<String, Double> balances = transactionLineRepository.sumPartyBalancesByStore(storeId)
                .stream()
                .collect(Collectors.toMap(
                        PartyBalanceRow::getPartyId,
                        row -> row.getBalance() != null ? row.getBalance() : 0.0
                ));

        return partyRepository.findByStoreId(storeId)
                .stream()
                .sorted(Comparator.comparing(Party::getName, String.CASE_INSENSITIVE_ORDER))
                .map(party -> new PartyBalanceResponse(
                        party.getId(),
                        party.getName(),
                        party.getContact(),
                        party.getAddress(),
                        PartyBalance.of(balances.getOrDefault(party.getId(), 0.0))
                ))
                .toList();
    }

    /**
     * Every expense totalled by its category — parts, bijli, salaries, misc… —
     * the khata's spend heads. Expenses carry no party, so they never surface in
     * the party list; grouping them by category puts recurring outgoings where the
     * shopkeeper reads their balances. Every category with at least one expense
     * shows, biggest spend first. Lines with no category (older than the feature)
     * fall under UNCATEGORIZED so nothing is lost.
     */
    public List<ExpenseCategoryGroupResponse> listExpenseCategories(String storeId)
    {
        // ponytail: scans full expense history each call; add a cached read-model if a shop's expense count ever makes this slow.
        Map<String, List<TransactionLine>> groups = transactionLineRepository.findExpenseLinesByStore(storeId)
                .stream()
                .collect(Collectors.groupingBy(
                        line -> line.getExpenseCategory() != null
                                ? line.getExpenseCategory().getName()
                                : ExpenseCategoryService.UNCATEGORIZED,
                        LinkedHashMap::new,
                        Collectors.toList()
                ));

        return groups.entrySet()
                .stream()
                .map(entry -> toCategoryGroup(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparingDouble(ExpenseCategoryGroupResponse::total).reversed())
                .toList();
    }

    private ExpenseCategoryGroupResponse toCategoryGroup(String category, List<TransactionLine> lines)
    {
        List<ExpenseCategoryRowResponse> rows = RunningBalanceFolder.fold(
                lines,
                0,
                this::value,
                (line, running) -> {
                    Transaction transaction = line.getTransaction();
                    return new ExpenseCategoryRowResponse(
                            transaction.getId(),
                            transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate(),
                            transaction.getCreatedAt(),
                            transaction.getDescription(),
                            value(line),
                            running
                    );
                }
        );

        double total = rows.isEmpty() ? 0 : rows.getLast().runningTotal();

        return new ExpenseCategoryGroupResponse(category, rows.size(), total, rows);
    }

    /**
     * Walk-in cash trade — no party, so neither ever posts a PARTY line and neither
     * surfaces among the party balances — grouped into Sales and Purchases, each with
     * its grand total and chronological rows with a running total. Only a kind with at
     * least one entry shows.
     */
    public List<CashGroupResponse> listCash(String storeId)
    {
        // ponytail: scans full cash history each call; add a cached read-model if a shop's cash-entry count ever makes this slow.
        List<CashGroupResponse> groups = new ArrayList<>();
        addCashGroup(groups, "SALE", transactionLineRepository.findCashSaleLinesByStore(storeId));
        addCashGroup(groups, "PURCHASE", transactionLineRepository.findCashPurchaseLinesByStore(storeId));
        return groups;
    }

    private void addCashGroup(List<CashGroupResponse> groups, String kind, List<TransactionLine> lines)
    {
        if (lines.isEmpty())
        {
            return;
        }

        List<CashRowResponse> rows = RunningBalanceFolder.fold(
                lines,
                0,
                this::value,
                (line, running) -> {
                    Transaction transaction = line.getTransaction();
                    return new CashRowResponse(
                            transaction.getId(),
                            transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate(),
                            transaction.getCreatedAt(),
                            ItemSummary.of(transaction),
                            transaction.getDescription(),
                            value(line),
                            running
                    );
                }
        );

        groups.add(new CashGroupResponse(kind, rows.size(), rows.getLast().runningTotal(), rows));
    }

    public PartyStatementResponse getStatement(String storeId, String partyId)
    {
        // findByIdForStore 404s on another store's party; the lines are then scoped to the
        // same store, so only entries posted in these books can appear in the statement.
        Party party = partyService.findByIdForStore(partyId, storeId);

        List<TransactionLine> lines = transactionLineRepository.findPartyLedgerLines(partyId, storeId);

        // A statement is one party's whole history, unpaged: a shop's oldest customer is the
        // slowest screen in the app, and this is the number that says so.
        log.debug("statement for party {} \"{}\" in store {}: {} ledger line(s)",
                partyId, party.getName(), storeId, lines.size());

        // FIFO settlement of charges (IN) by payments (OUT), oldest bill first — the
        // shopkeeper doesn't tie a payment to a bill, so newest money clears oldest dues.
        // ponytail: receivable view (IN = charge). Supplier/payable per-bill status isn't marked; add if a shop needs it.
        double[] chargeRemaining = ReceivableAging.chargeRemaining(
                lines.stream()
                        .map(line -> line.getInOut() == InOut.IN
                                ? new ReceivableAging.Movement(0, value(line), 0)
                                : line.getInOut() == InOut.OUT
                                        ? new ReceivableAging.Movement(0, 0, value(line))
                                        : new ReceivableAging.Movement(0, 0, 0))
                        .toList()
        );

        int[] chargeIndex = { 0 }; // advances once per IN line, staying aligned with chargeRemaining

        List<PartyStatementRowResponse> rows = RunningBalanceFolder.fold(
                lines,
                0,
                this::signedValue,
                (line, running) -> {
                    Transaction transaction = line.getTransaction();
                    Boolean cleared = line.getInOut() == InOut.IN
                            ? chargeRemaining[chargeIndex[0]++] <= 0.005
                            : null;
                    return new PartyStatementRowResponse(
                            transaction.getId(),
                            transaction.getEventDate() != null ? transaction.getEventDate() : transaction.getEntryDate(),
                            transaction.getCreatedAt(),
                            transaction.getEvent(),
                            transaction.getDescription(),
                            ItemSummary.of(transaction),
                            line.getInOut(),
                            value(line),
                            isDocument(transaction) ? shown(DocumentTotals.goods(transaction)) : null,
                            shown(DocumentTotals.cash(transaction)),
                            PartyBalance.of(running),
                            cleared
                    );
                }
        );

        PartyBalance current = rows.isEmpty() ? PartyBalance.of(0) : rows.getLast().runningBalance();

        double totalBilled = lines.stream().filter(l -> l.getInOut() == InOut.IN).mapToDouble(this::value).sum();
        double totalPaid = lines.stream().filter(l -> l.getInOut() == InOut.OUT).mapToDouble(this::value).sum();
        LocalDate lastPaymentDate = rows.stream()
                .filter(r -> r.inOut() == InOut.OUT)
                .map(PartyStatementRowResponse::date)
                .max(Comparator.naturalOrder())
                .orElse(null);

        return new PartyStatementResponse(
                party.getId(), party.getName(), party.getContact(), rows, current,
                totalBilled, totalPaid, lastPaymentDate
        );
    }

    /**
     * Whether the entry stands for a piece of paper with goods on it, and so has a bill
     * total worth showing beside its khata figure. A receipt is not a document — the cash
     * is the whole of it — and a processing batch never posts a PARTY line to begin with.
     */
    private static boolean isDocument(Transaction transaction)
    {
        return transaction.getEvent() == TransactionEvent.SALE
                || transaction.getEvent() == TransactionEvent.PURCHASE;
    }

    /**
     * A figure the row shows only when there is one. Zero is left out rather than printed:
     * a sale paid in full posts a PARTY line of nothing, and a bare "0" in the column reads
     * as a real amount instead of as nothing outstanding.
     */
    private static Double shown(double amount)
    {
        return amount > 0.005 ? amount : null;
    }

    private double signedValue(TransactionLine line)
    {
        return switch (line.getInOut())
        {
            case IN -> value(line);
            case OUT -> -value(line);
            default -> 0;
        };
    }

    private double value(TransactionLine line)
    {
        return line.getValue() != null ? line.getValue() : 0;
    }
}
