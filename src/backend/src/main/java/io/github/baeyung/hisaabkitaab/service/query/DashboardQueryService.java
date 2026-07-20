package io.github.baeyung.hisaabkitaab.service.query;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.dashboard.DashboardResponse;
import io.github.baeyung.hisaabkitaab.dto.dashboard.DashboardResponse.DailyPoint;
import io.github.baeyung.hisaabkitaab.dto.dashboard.DashboardResponse.DeadStockItem;
import io.github.baeyung.hisaabkitaab.dto.dashboard.DashboardResponse.ExpenseGroup;
import io.github.baeyung.hisaabkitaab.dto.dashboard.DashboardResponse.PartyRef;
import io.github.baeyung.hisaabkitaab.dto.dashboard.DashboardResponse.TopItem;
import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.StoreItem;
import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.repository.PartyRepository;
import io.github.baeyung.hisaabkitaab.repository.StoreItemRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository.ItemStockRow;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository.PartyBalanceRow;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import lombok.RequiredArgsConstructor;

/**
 * The analytics dashboard: one call rolls the store's transaction lines into
 * the home screen's cards, trend series, and top lists. Everything derives from
 * the same read model the other query services use — nothing new is persisted.
 *
 * ponytail: aggregates in Java over per-window fetches, mirroring
 * {@link LedgerQueryService}. A shop's window-scoped sale/expense line count is
 * small; add a cached read-model only if a real store ever makes this slow.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DashboardQueryService
{
    private static final int TOP_ITEMS = 6;
    private static final int TOP_DEAD_STOCK = 6;
    private static final int TOP_PARTIES = 5;
    private static final int TOP_EXPENSES = 6;

    private final StoreService storeService;
    private final PartyRepository partyRepository;
    private final StoreItemRepository storeItemRepository;
    private final TransactionLineRepository transactionLineRepository;

    public DashboardResponse getDashboard(String ownerId, LocalDate from, LocalDate to)
    {
        Store store = storeService.getPrimaryStoreForOwner(ownerId);
        String storeId = store.getId();

        // Cash position as-of `to` inclusive: net cash strictly before the day after.
        double cashPosition = transactionLineRepository.sumCashBefore(storeId, to.plusDays(1));

        List<TransactionLine> saleLines = transactionLineRepository.findSaleStockLinesInRange(storeId, from, to);
        List<TransactionLine> expenseLines = transactionLineRepository.findExpenseLinesByStore(storeId)
                .stream()
                .filter(line -> inRange(businessDate(line), from, to))
                .toList();

        // ── Daily series: revenue and cogs from sale lines, spend from expense lines ──
        Map<LocalDate, double[]> byDay = new LinkedHashMap<>(); // [sales, cogs, spend]
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1))
        {
            byDay.put(d, new double[3]);
        }
        for (TransactionLine line : saleLines)
        {
            double[] slot = byDay.get(businessDate(line));
            if (slot != null)
            {
                slot[0] += revenue(line);
                slot[1] += cogs(line);
            }
        }
        for (TransactionLine line : expenseLines)
        {
            double[] slot = byDay.get(businessDate(line));
            if (slot != null)
            {
                slot[2] += value(line);
            }
        }

        List<DailyPoint> daily = byDay.entrySet()
                .stream()
                .map(e -> {
                    double[] s = e.getValue();
                    return new DailyPoint(e.getKey(), s[0], s[2], s[0] - s[1] - s[2]);
                })
                .toList();

        double sales = daily.stream().mapToDouble(DailyPoint::sales).sum();
        double spend = daily.stream().mapToDouble(DailyPoint::spend).sum();
        double profit = daily.stream().mapToDouble(DailyPoint::profit).sum();

        PartySplit parties = topReceivablesAndPayables(storeId);

        return new DashboardResponse(
                from,
                to,
                cashPosition,
                profit,
                sales,
                spend,
                parties.receivablesTotal(),
                parties.payablesTotal(),
                daily,
                topItems(saleLines),
                deadStock(storeId, saleLines),
                parties.receivables(),
                parties.payables(),
                topExpenses(expenseLines)
        );
    }

    // ── Top-selling designs: sale lines grouped by item, ranked by revenue ──
    private List<TopItem> topItems(List<TransactionLine> saleLines)
    {
        Map<String, TopItem> byItem = new LinkedHashMap<>();
        for (TransactionLine line : saleLines)
        {
            StoreItem item = line.getItem();
            byItem.merge(
                    item.getId(),
                    new TopItem(item.getId(), item.getName(), item.getUnit(), quantity(line), revenue(line)),
                    (a, b) -> new TopItem(a.itemId(), a.name(), a.unit(), a.quantity() + b.quantity(), a.revenue() + b.revenue())
            );
        }
        return byItem.values()
                .stream()
                .sorted(Comparator.comparingDouble(TopItem::revenue).reversed())
                .limit(TOP_ITEMS)
                .toList();
    }

    // ── Dead stock: items with stock on hand and no sale in the window ──
    private List<DeadStockItem> deadStock(String storeId, List<TransactionLine> saleLines)
    {
        java.util.Set<String> soldItemIds = saleLines.stream()
                .map(line -> line.getItem().getId())
                .collect(Collectors.toSet());

        Map<String, BigDecimal> stock = transactionLineRepository.sumStockByStore(storeId)
                .stream()
                .collect(Collectors.toMap(
                        ItemStockRow::getItemId,
                        row -> row.getStock() != null ? row.getStock() : BigDecimal.ZERO
                ));

        return storeItemRepository.findByStoreId(storeId)
                .stream()
                .filter(item -> !soldItemIds.contains(item.getId()))
                .map(item -> {
                    BigDecimal qty = stock.getOrDefault(item.getId(), BigDecimal.ZERO);
                    double cost = item.getCostPrice() != null ? item.getCostPrice().doubleValue() : 0;
                    return new DeadStockItem(item.getId(), item.getName(), item.getUnit(), qty.doubleValue(), qty.doubleValue() * cost);
                })
                .filter(d -> d.stock() > 0)
                .sorted(Comparator.comparingDouble(DeadStockItem::value).reversed())
                .limit(TOP_DEAD_STOCK)
                .toList();
    }

    // ── Most-expensive expenses: window expense lines grouped by note ──
    private List<ExpenseGroup> topExpenses(List<TransactionLine> expenseLines)
    {
        Map<String, List<TransactionLine>> groups = expenseLines.stream()
                .filter(line -> line.getTransaction().getDescription() != null
                        && !line.getTransaction().getDescription().isBlank())
                .collect(Collectors.groupingBy(
                        line -> line.getTransaction().getDescription().trim().toLowerCase(),
                        LinkedHashMap::new,
                        Collectors.toList()
                ));

        return groups.values()
                .stream()
                .map(lines -> new ExpenseGroup(
                        lines.getFirst().getTransaction().getDescription().trim(),
                        lines.size(),
                        lines.stream().mapToDouble(this::value).sum()
                ))
                .sorted(Comparator.comparingDouble(ExpenseGroup::total).reversed())
                .limit(TOP_EXPENSES)
                .toList();
    }

    // ── Receivables / payables split from the cumulative party balances ──
    private PartySplit topReceivablesAndPayables(String storeId)
    {
        Map<String, Double> balances = transactionLineRepository.sumPartyBalancesByStore(storeId)
                .stream()
                .collect(Collectors.toMap(
                        PartyBalanceRow::getPartyId,
                        row -> row.getBalance() != null ? row.getBalance() : 0.0
                ));

        List<PartyRef> receivables = new ArrayList<>();
        List<PartyRef> payables = new ArrayList<>();
        double receivablesTotal = 0;
        double payablesTotal = 0;
        // Iterate real parties (as the ledger screen does), so a null-party
        // bucket — walk-in cash lines with no party — never leaks a nameless
        // row or a total that disagrees with the khata.
        for (Party party : partyRepository.findByStoreId(storeId))
        {
            double net = balances.getOrDefault(party.getId(), 0.0);
            if (net > 0.005)
            {
                receivables.add(new PartyRef(party.getId(), party.getName(), net));
                receivablesTotal += net;
            }
            else if (net < -0.005)
            {
                payables.add(new PartyRef(party.getId(), party.getName(), -net));
                payablesTotal += -net;
            }
        }
        receivables.sort(Comparator.comparingDouble(PartyRef::amount).reversed());
        payables.sort(Comparator.comparingDouble(PartyRef::amount).reversed());

        return new PartySplit(
                receivables.stream().limit(TOP_PARTIES).toList(),
                payables.stream().limit(TOP_PARTIES).toList(),
                receivablesTotal,
                payablesTotal
        );
    }

    private record PartySplit(List<PartyRef> receivables, List<PartyRef> payables, double receivablesTotal, double payablesTotal)
    {
    }

    private LocalDate businessDate(TransactionLine line)
    {
        Transaction t = line.getTransaction();
        return t.getEventDate() != null ? t.getEventDate() : t.getEntryDate();
    }

    private boolean inRange(LocalDate day, LocalDate from, LocalDate to)
    {
        return day != null && !day.isBefore(from) && !day.isAfter(to);
    }

    private double quantity(TransactionLine line)
    {
        return line.getQuantity() != null ? line.getQuantity().doubleValue() : 0;
    }

    private double revenue(TransactionLine line)
    {
        double rate = line.getItemSoldAt() != null ? line.getItemSoldAt() : 0;
        return quantity(line) * rate;
    }

    private double cogs(TransactionLine line)
    {
        StoreItem item = line.getItem();
        double cost = item != null && item.getCostPrice() != null ? item.getCostPrice().doubleValue() : 0;
        return quantity(line) * cost;
    }

    private double value(TransactionLine line)
    {
        return line.getValue() != null ? line.getValue() : 0;
    }
}
