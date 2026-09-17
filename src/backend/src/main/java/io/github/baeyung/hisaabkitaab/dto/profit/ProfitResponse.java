package io.github.baeyung.hisaabkitaab.dto.profit;

import java.time.LocalDate;
import java.util.List;

/**
 * What the shop actually made over one window, and how much of that figure can be trusted.
 *
 * <p>Nothing here is stored. Every cost on this screen is reconstructed by replaying the goods
 * ledger (see {@code CostReplay}), because the catalogue only carries what an item costs
 * <em>now</em> — which is the wrong number to judge a bill from three months ago by.
 *
 * <p>{@code coveragePct} is the honesty figure and belongs beside the totals, not buried: it is the
 * share of the window's revenue whose cost was actually known. At 100 the profit below is the
 * profit. At 60 it is the profit on the 60, and the screen says so rather than quietly averaging a
 * guess into it.
 */
public record ProfitResponse(
        LocalDate from,
        LocalDate to,
        /** Everything sold in the window, after bill discounts. */
        double revenue,
        /** What those bills knocked off — carried separately so the discount is visible, not just felt. */
        double discounts,
        /** Cost of the goods behind the costed part of that revenue. */
        double cogs,
        /** revenue − cogs, over the costed part only. */
        double grossProfit,
        /** Cash spent on running the shop in the window: rent, bijli, chai. Not goods. */
        double expenses,
        double netProfit,
        double marginPct,
        double coveragePct,
        /** The slice of revenue with no cost behind it — what {@code coveragePct} is missing. */
        double uncostedRevenue,
        List<DailyProfit> daily,
        List<ItemProfit> topItems,
        List<ItemProfit> lossMakers,
        List<UncostedItem> uncosted,
        DayRef bestDay,
        DayRef worstDay,
        /** The working behind the headline: every design sold in the window, one row each. */
        List<StatementLine> statement,
        /** The expenses figure, opened up by category, largest first. */
        List<ExpenseLine> expensesByCategory
)
{
    /**
     * One day of trading. Gross, never net: an expense is a lump on the day it was paid, so
     * spreading rent across a month would invent a loss on the first and a profit on the rest.
     */
    public record DailyProfit(LocalDate date, double revenue, double cogs, double profit, double marginPct)
    {
    }

    /**
     * One design's trading over the window. Ranked by profit rather than revenue, because the
     * busiest thing on the shelf is not always the one paying for the shop.
     */
    public record ItemProfit(
            String itemId,
            String name,
            String unit,
            double quantity,
            double revenue,
            double cogs,
            double profit,
            double marginPct
    )
    {
    }

    /**
     * A design that sold with no cost behind it, and what to do about it.
     *
     * <p>{@code everPurchased} splits the two fixes, which are not the same job: an item that has
     * been bought but has no usable rate on those purchases needs its cost price set, while one
     * the books have never seen arrive needs the purchase recording.
     */
    public record UncostedItem(
            String itemId,
            String name,
            String unit,
            double quantity,
            double revenue,
            boolean everPurchased
    )
    {
    }

    /** The window's best and worst day, for the two callouts over the trend. */
    public record DayRef(LocalDate date, double profit, double revenue)
    {
    }

    /**
     * One design's line on the statement — the figures a shopkeeper would write across a page
     * to work profit out by hand: how much went, at what rate, what it had cost, what was left.
     *
     * <p>Unlike {@link ItemProfit} this row is never dropped for want of a cost. A design whose
     * sales could not all be priced still sold, and its revenue is still in the total; what it
     * lacks is shown as the gap between {@code quantity} and {@code costedQuantity}, and the
     * rates and profit are taken over the costed part only, so nothing here is a guess.
     *
     * <p>{@code saleRate} and {@code costRate} are averages over the window, not any one bill's —
     * the same cloth goes out at three rates in a week, and the statement wants one line for it.
     */
    public record StatementLine(
            String itemId,
            String name,
            String unit,
            double quantity,
            /** revenue ÷ quantity: what a unit fetched on average, after discounts. */
            double saleRate,
            double revenue,
            /** How much of {@code quantity} the replay could put a cost against. */
            double costedQuantity,
            /** cogs ÷ costedQuantity: what a unit had cost on average. Zero when nothing was costed. */
            double costRate,
            double cogs,
            /** Over the costed part only — see the record note. */
            double profit,
            double marginPct,
            /** The slice of this row's revenue that the profit above does not cover. */
            double uncostedRevenue
    )
    {
    }

    /** One expense head's total over the window. {@code category} is null for the uncategorised. */
    public record ExpenseLine(String category, double amount)
    {
    }
}
