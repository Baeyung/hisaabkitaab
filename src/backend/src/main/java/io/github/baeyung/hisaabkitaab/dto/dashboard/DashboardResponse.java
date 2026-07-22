package io.github.baeyung.hisaabkitaab.dto.dashboard;

import java.time.LocalDate;
import java.util.List;

/**
 * The analytics dashboard for one window.
 *
 * Totals and series are window-scoped ({@code from..to}); balances
 * (receivables/payables) and cash position are cumulative as-of {@code to},
 * because a khata balance isn't a per-window number.
 */
public record DashboardResponse(
        LocalDate from,
        LocalDate to,
        double cashPosition,
        double sales,
        double spend,
        double receivablesTotal,
        double payablesTotal,
        List<DailyPoint> daily,
        List<TopItem> topItems,
        List<DeadStockItem> deadStock,
        List<PartyRef> topReceivables,
        List<PartyRef> topPayables,
        List<StaleParty> staleReceivables,
        List<ExpenseGroup> topExpenses
)
{
    /**
     * One calendar day's trend point: sales (revenue) and spend (expenses) are
     * that day's flows; {@code cash} is the running drawer balance at the day's
     * close — a stock, so it rides the chart's secondary axis.
     */
    public record DailyPoint(LocalDate date, double sales, double spend, double cash)
    {
    }

    /** A design that sold in the window, by quantity moved and revenue earned. */
    public record TopItem(String itemId, String name, String unit, double quantity, double revenue)
    {
    }

    /** Stock on hand that saw no sale in the window — capital sitting idle. */
    public record DeadStockItem(String itemId, String name, String unit, double stock, double value)
    {
    }

    /** A party the shop owes or is owed, for the top-parties lists. */
    public record PartyRef(String partyId, String name, double amount)
    {
    }

    /**
     * A party who owes the shop, plus {@code daysStale} — how long the oldest
     * still-unpaid charge has sat (FIFO: payments settle oldest charges first).
     * Big amount + high days = a customer to stop extending credit to.
     */
    public record StaleParty(String partyId, String name, double amount, int daysStale)
    {
    }

    public record ExpenseGroup(String category, int count, double total)
    {
    }
}
