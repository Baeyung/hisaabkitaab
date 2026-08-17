package io.github.baeyung.hisaabkitaab.dto.report;

import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.dto.ledger.PartyStatementResponse;

/**
 * One khata holder's statement, as the monthly job sends it to them.
 *
 * <p>The statement is the same one the shopkeeper shares by hand from the khata screen — the
 * customer who gets chased on the 31st and asks about it on the 2nd must be looking at the same
 * paper the shop is.
 *
 * @param daysStale how long this party's oldest unpaid bill has sat, by FIFO settlement — the
 *                  measure they were picked by, printed so the reminder can say why it came.
 *                  See {@code ReceivableAging}.
 */
public record PartyReminderResponse(
        LocalDate date,
        ReportStore store,
        PartyStatementResponse statement,
        int daysStale)
{
}
