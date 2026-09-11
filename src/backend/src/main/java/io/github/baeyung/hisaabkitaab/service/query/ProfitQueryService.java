package io.github.baeyung.hisaabkitaab.service.query;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.profit.ProfitResponse;
import io.github.baeyung.hisaabkitaab.dto.profit.ProfitResponse.DailyProfit;
import io.github.baeyung.hisaabkitaab.dto.profit.ProfitResponse.DayRef;
import io.github.baeyung.hisaabkitaab.dto.profit.ProfitResponse.ItemProfit;
import io.github.baeyung.hisaabkitaab.dto.profit.ProfitResponse.UncostedItem;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.repository.TransactionLineRepository;
import io.github.baeyung.hisaabkitaab.service.query.support.CostReplay;
import io.github.baeyung.hisaabkitaab.service.query.support.CostReplay.Sale;
import io.github.baeyung.hisaabkitaab.service.query.support.StockLedgerRow;
import lombok.RequiredArgsConstructor;

/**
 * Profit analysis: what the shop made over a window, and what it made it on.
 *
 * <p>The dashboard answers "how much came in". This answers the harder question the shopkeeper
 * actually loses sleep over — how much of that was <em>kept</em> — which needs a cost against every
 * sale, and no cost is recorded at sale time. {@link CostReplay} reconstructs them by walking the
 * goods ledger; everything here folds the sales it hands back into the screen's cards and lists.
 *
 * ponytail: reads the store's whole goods history on every call, like the receivable aging walk
 * next door, and logs how big that read was. A shop measured in years of daily bills is still tens
 * of thousands of rows; add a stored cost-at-sale only when a real store makes this slow.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProfitQueryService
{
    private static final Logger log = LoggerFactory.getLogger(ProfitQueryService.class);

    private static final int TOP_ITEMS = 8;
    private static final int TOP_LOSS_MAKERS = 6;
    private static final int TOP_UNCOSTED = 8;
    private static final double EPSILON = 0.005;

    private final TransactionLineRepository transactionLineRepository;

    public ProfitResponse getProfit(String storeId, LocalDate from, LocalDate to)
    {
        long startedAt = System.nanoTime();

        List<StockLedgerRow> history = transactionLineRepository.findStockLedgerRowsByStore(storeId, to);
        List<Sale> sales = CostReplay.priceSales(history, from, to);

        double revenue = sales.stream().mapToDouble(Sale::revenue).sum();
        double uncostedRevenue = sales.stream().filter(s -> !s.costed()).mapToDouble(Sale::revenue).sum();
        double cogs = sales.stream().filter(Sale::costed).mapToDouble(Sale::cost).sum();
        // Gross profit is taken over the costed sales alone. Folding the uncosted ones in at zero
        // cost would show their whole revenue as profit — an error that always flatters, on the
        // screen a shopkeeper is most likely to act on.
        double costedRevenue = revenue - uncostedRevenue;
        double grossProfit = costedRevenue - cogs;

        double expenses = expensesInRange(storeId, from, to);
        double netProfit = grossProfit - expenses;

        List<DailyProfit> daily = daily(sales, from, to);

        ProfitResponse response = new ProfitResponse(
                from,
                to,
                revenue,
                discountsInRange(history, from, to),
                cogs,
                grossProfit,
                expenses,
                netProfit,
                pct(grossProfit, costedRevenue),
                pct(costedRevenue, revenue),
                uncostedRevenue,
                daily,
                topItems(sales),
                lossMakers(sales),
                uncosted(history, sales),
                pick(daily, Comparator.comparingDouble(DailyProfit::profit)),
                pick(daily, Comparator.comparingDouble(DailyProfit::profit).reversed())
        );

        // The whole cost of this page is the size of that first read, so it is what gets logged:
        // a profit screen that crawls for an old shop is this line growing, not a plan gone wrong.
        log.debug("profit for store {} over {}..{}: replayed {} stock row(s) into {} sale(s), "
                        + "{}% costed, in {}ms",
                storeId, from, to, history.size(), sales.size(),
                Math.round(response.coveragePct()), (System.nanoTime() - startedAt) / 1_000_000);

        return response;
    }

    /**
     * Running the shop, not stocking it: an expense is a cash-out whose entry is an EXPENSE.
     * Read off the window's cash lines the way the dashboard reads them, because the only query
     * that returns a shop's expenses returns every one it ever filed.
     */
    private double expensesInRange(String storeId, LocalDate from, LocalDate to)
    {
        return transactionLineRepository.findCashLinesInRange(storeId, from, to)
                .stream()
                .filter(line -> line.getTransaction().getEvent() == TransactionEvent.EXPENSE)
                .filter(line -> line.getInOut() == InOut.OUT)
                .mapToDouble(line -> line.getValue() != null ? line.getValue() : 0)
                .sum();
    }

    /**
     * What the window's sale bills knocked off their totals.
     *
     * <p>Counted once per bill, not once per line: a discount lives on the entry, so a four-line
     * bill carries the same figure on all four rows and summing the rows would quadruple it.
     */
    private double discountsInRange(List<StockLedgerRow> history, LocalDate from, LocalDate to)
    {
        Map<String, Double> byTransaction = new HashMap<>();
        for (StockLedgerRow row : history)
        {
            if (row.event() == TransactionEvent.SALE
                    && row.discount() != null
                    && !row.businessDate().isBefore(from)
                    && !row.businessDate().isAfter(to))
            {
                byTransaction.put(row.transactionId(), row.discount());
            }
        }
        return byTransaction.values().stream().mapToDouble(Double::doubleValue).sum();
    }

    /**
     * The trend, day by day, including the days nothing happened — a shut Friday is part of the
     * shape of a week and a chart that skips it draws a busier shop than the one that exists.
     */
    private List<DailyProfit> daily(List<Sale> sales, LocalDate from, LocalDate to)
    {
        Map<LocalDate, double[]> byDay = new LinkedHashMap<>(); // [revenue, cogs, costedRevenue]
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1))
        {
            byDay.put(d, new double[3]);
        }
        for (Sale sale : sales)
        {
            double[] slot = byDay.get(sale.date());
            if (slot == null)
            {
                continue;
            }
            slot[0] += sale.revenue();
            if (sale.costed())
            {
                slot[1] += sale.cost();
                slot[2] += sale.revenue();
            }
        }

        List<DailyProfit> daily = new ArrayList<>(byDay.size());
        byDay.forEach((date, slot) -> {
            double profit = slot[2] - slot[1];
            daily.add(new DailyProfit(date, slot[0], slot[1], profit, pct(profit, slot[2])));
        });
        return daily;
    }

    /** The designs that paid for the shop, best first. Uncosted sales sit this out — see {@link #uncosted}. */
    private List<ItemProfit> topItems(List<Sale> sales)
    {
        return byItem(sales).stream()
                .sorted(Comparator.comparingDouble(ItemProfit::profit).reversed())
                .limit(TOP_ITEMS)
                .toList();
    }

    /**
     * What went out of the door for less than it came in at, worst first.
     *
     * <p>Worth a card of its own rather than the bottom of the list above: this is usually an old
     * rate left on the item, or a bill discounted past its cost, and both are fixable the same week
     * they are noticed.
     */
    private List<ItemProfit> lossMakers(List<Sale> sales)
    {
        return byItem(sales).stream()
                .filter(item -> item.profit() < -EPSILON)
                .sorted(Comparator.comparingDouble(ItemProfit::profit))
                .limit(TOP_LOSS_MAKERS)
                .toList();
    }

    /** One row per design over the costed sales, folded from the priced lines. */
    private List<ItemProfit> byItem(List<Sale> sales)
    {
        Map<String, double[]> totals = new LinkedHashMap<>(); // [quantity, revenue, cogs]
        Map<String, Sale> firstSeen = new LinkedHashMap<>();
        for (Sale sale : sales)
        {
            if (!sale.costed())
            {
                continue;
            }
            firstSeen.putIfAbsent(sale.itemId(), sale);
            double[] slot = totals.computeIfAbsent(sale.itemId(), id -> new double[3]);
            slot[0] += sale.quantity();
            slot[1] += sale.revenue();
            slot[2] += sale.cost();
        }

        List<ItemProfit> items = new ArrayList<>(totals.size());
        totals.forEach((itemId, slot) -> {
            Sale sale = firstSeen.get(itemId);
            double profit = slot[1] - slot[2];
            items.add(new ItemProfit(
                    itemId, sale.itemName(), sale.unit(), slot[0], slot[1], slot[2], profit, pct(profit, slot[1])));
        });
        return items;
    }

    /**
     * The designs the screen cannot price, biggest first — the work list behind the coverage
     * figure. Each carries whether the books have ever seen it arrive, which is the difference
     * between "set its cost price" and "record the purchase".
     */
    private List<UncostedItem> uncosted(List<StockLedgerRow> history, List<Sale> sales)
    {
        Set<String> everPurchased = new HashSet<>();
        for (StockLedgerRow row : history)
        {
            if (row.itemId() != null && row.inOut() == InOut.IN && row.event() == TransactionEvent.PURCHASE)
            {
                everPurchased.add(row.itemId());
            }
        }

        Map<String, double[]> totals = new LinkedHashMap<>(); // [quantity, revenue]
        Map<String, Sale> firstSeen = new LinkedHashMap<>();
        for (Sale sale : sales)
        {
            if (sale.costed())
            {
                continue;
            }
            firstSeen.putIfAbsent(sale.itemId(), sale);
            double[] slot = totals.computeIfAbsent(sale.itemId(), id -> new double[2]);
            slot[0] += sale.quantity();
            slot[1] += sale.revenue();
        }

        List<UncostedItem> items = new ArrayList<>(totals.size());
        totals.forEach((itemId, slot) -> {
            Sale sale = firstSeen.get(itemId);
            items.add(new UncostedItem(
                    itemId, sale.itemName(), sale.unit(), slot[0], slot[1], everPurchased.contains(itemId)));
        });
        return items.stream()
                .sorted(Comparator.comparingDouble(UncostedItem::revenue).reversed())
                .limit(TOP_UNCOSTED)
                .toList();
    }

    /**
     * The standout day by one reading, or nothing when there is only one day that traded — a
     * shop's single trading day is both its best and its worst, and showing it twice under two
     * headings reads as two facts.
     */
    private DayRef pick(List<DailyProfit> daily, Comparator<DailyProfit> order)
    {
        List<DailyProfit> traded = daily.stream().filter(d -> d.revenue() > EPSILON).toList();
        if (traded.size() < 2)
        {
            return null;
        }
        DailyProfit day = traded.stream().max(order).orElseThrow();
        return new DayRef(day.date(), day.profit(), day.revenue());
    }

    /** A percentage, or zero when there is no base to take one of — never a NaN on the wire. */
    private double pct(double part, double whole)
    {
        return whole > EPSILON ? part / whole * 100 : 0;
    }
}
