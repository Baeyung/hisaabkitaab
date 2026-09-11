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
        DayRef worstDay
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
}
