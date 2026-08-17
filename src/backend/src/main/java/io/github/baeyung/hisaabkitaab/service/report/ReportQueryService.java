package io.github.baeyung.hisaabkitaab.service.report;

import java.time.LocalDate;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.report.DailyReportResponse;
import io.github.baeyung.hisaabkitaab.dto.report.PartyReminderResponse;
import io.github.baeyung.hisaabkitaab.dto.report.ReportStore;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.service.query.CashbookQueryService;
import io.github.baeyung.hisaabkitaab.service.query.DashboardQueryService;
import io.github.baeyung.hisaabkitaab.service.query.InventoryQueryService;
import io.github.baeyung.hisaabkitaab.service.query.LedgerQueryService;
import io.github.baeyung.hisaabkitaab.service.query.TransactionQueryService;
import lombok.RequiredArgsConstructor;

/**
 * What goes on a report, gathered from the screens' own query services.
 *
 * <p>Nothing here computes anything. Every section of the daily report is one existing call —
 * the cashbook's day, the bills and purchases dated to it, the khata list, the stock list — and
 * the reminder is the same statement the khata screen shows. That is the whole design: a report
 * that derived its own totals would eventually disagree with the app, and the shopkeeper would
 * have no way of telling which one was lying.
 *
 * <p>Unlike every other query service here, this one is reached without a signed-in user, so it
 * loads the store itself rather than being handed one by {@code CurrentStoreArgumentResolver}.
 * The tenant check that resolver performs is done instead by the report token, which is signed
 * over the store id — see {@code ReportTokenService}. Past that point this scopes on the store
 * id alone, exactly as the services behind the resolver do.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportQueryService
{
    private final StoreRepository storeRepository;

    private final CashbookQueryService cashbookQueryService;

    private final TransactionQueryService transactionQueryService;

    private final LedgerQueryService ledgerQueryService;

    private final InventoryQueryService inventoryQueryService;

    private final DashboardQueryService dashboardQueryService;

    public DailyReportResponse daily(String storeId, LocalDate date)
    {
        Store store = store(storeId);

        return new DailyReportResponse(
                date,
                ReportStore.of(store),
                cashbookQueryService.getRange(storeId, date, date),
                transactionQueryService.listDetailsInRange(storeId, TransactionEvent.SALE, date, date),
                transactionQueryService.listDetailsInRange(storeId, TransactionEvent.PURCHASE, date, date),
                ledgerQueryService.listBalances(storeId),
                inventoryQueryService.listStock(storeId));
    }

    public PartyReminderResponse reminder(String storeId, String partyId, LocalDate date)
    {
        Store store = store(storeId);

        // Read back rather than carried from the selection: the job picked this party minutes
        // ago and the number it prints has to be the one on the statement, not one remembered
        // from a list. Cheap enough — the walk is over one shop's party lines either way.
        int daysStale = dashboardQueryService.staleReceivables(storeId, date).stream()
                .filter(party -> party.partyId().equals(partyId))
                .mapToInt(party -> party.daysStale())
                .findFirst()
                .orElse(0);

        return new PartyReminderResponse(
                date,
                ReportStore.of(store),
                ledgerQueryService.getStatement(storeId, partyId),
                daysStale);
    }

    private Store store(String storeId)
    {
        return storeRepository.findById(storeId)
                .orElseThrow(() -> ResourceNotFoundException.forEntity("Store", storeId));
    }
}
