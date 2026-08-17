package io.github.baeyung.hisaabkitaab.dto.report;

import java.time.LocalDate;
import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.cashbook.CashbookDayResponse;
import io.github.baeyung.hisaabkitaab.dto.inventory.ItemStockResponse;
import io.github.baeyung.hisaabkitaab.dto.ledger.PartyBalanceResponse;
import io.github.baeyung.hisaabkitaab.dto.transaction.BillDetailResponse;

/**
 * One shop's day, whole — what the nightly job prints and sends its owner.
 *
 * <p>Assembled from the same query services the screens read, rather than from anything of its
 * own: the report has to agree with what the shopkeeper sees when they open the app the next
 * morning, and the only way to guarantee that is for it to be the same numbers.
 *
 * @param cashbook  the day's entries with the drawer's opening and closing balance — the day as
 *                  money moving.
 * @param bills     every bill written that day, with its goods.
 * @param purchases the same on the buying side.
 * @param parties   every khata and what it stands at. A position as of the day's end rather
 *                  than a record of the day: a balance is not a thing that happens on a date.
 * @param stock     the same for goods — what is on the shelf when the shutter comes down.
 */
public record DailyReportResponse(
        LocalDate date,
        ReportStore store,
        CashbookDayResponse cashbook,
        List<BillDetailResponse> bills,
        List<BillDetailResponse> purchases,
        List<PartyBalanceResponse> parties,
        List<ItemStockResponse> stock)
{
    /**
     * Whether anything was actually recorded on this day. The scheduler asks before sending:
     * a shop that was shut has a khata list and a stock list like any other, so "the report is
     * empty" cannot be read off the document as a whole — only off the day's own entries.
     */
    public boolean hasActivity()
    {
        return !cashbook.rows().isEmpty() || !bills.isEmpty() || !purchases.isEmpty();
    }
}
