package io.github.baeyung.hisaabkitaab.service.report;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import io.github.baeyung.hisaabkitaab.dto.dashboard.DashboardResponse.StaleParty;
import io.github.baeyung.hisaabkitaab.dto.plan.PlanLimits;
import io.github.baeyung.hisaabkitaab.dto.report.DailyReportResponse;
import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendSource;
import io.github.baeyung.hisaabkitaab.models.ReportSettings;
import io.github.baeyung.hisaabkitaab.models.StoreSettings;
import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.repository.WhatsAppSendRepository;
import io.github.baeyung.hisaabkitaab.service.PlanService;
import io.github.baeyung.hisaabkitaab.service.query.DashboardQueryService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.Addressee;
import io.github.baeyung.hisaabkitaab.service.whatsapp.DocumentShareService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.ShareRecipientService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.WhatsAppBlockService;
import lombok.RequiredArgsConstructor;

/**
 * The clock the two scheduled reports run on.
 *
 * <p>Ticks once a minute and asks every open shop whether this is its minute. That is the whole
 * mechanism: shops keep their own times in {@code ReportSettings}, and a minute is fine enough
 * that a shopkeeper picking 21:00 gets 21:00. Registering a cron per shop would mean rebuilding
 * the schedule every time somebody edited a setting — a lot of machinery to arrive at the same
 * place.
 *
 * <p>Times are read in {@code app.timezone}, not the server's. Everything a shopkeeper enters is
 * already a plain business date with no timezone in it; this is the one place the app has to
 * know what "today" and "20:00" mean, and a container running UTC would otherwise send the
 * evening report at two in the morning.
 *
 * <p>Nothing here retries. Each job asks {@code whatsapp_sends} whether it has already run for
 * this shop today — or this month — and does nothing if it has, so a restart on the same minute,
 * an overlapping slow run, or a clock stepping backwards cannot send twice. The same guard means
 * a failed run is not attempted again until tomorrow, which is deliberate: sixty attempts an hour
 * at a renderer that is down would be worse than a missed evening, and the failure is on record
 * either way.
 */
@Service
@RequiredArgsConstructor
public class ReportScheduler
{
    private static final Logger log = LoggerFactory.getLogger(ReportScheduler.class);

    /** The noun that reads inside the WhatsApp template's sentence. English for now. */
    private static final String DAILY_ACTION = "Daily report";

    private static final String REMINDER_ACTION = "Khata statement";

    private final StoreRepository storeRepository;

    private final WhatsAppSendRepository sendRepository;

    private final ReportQueryService reportQueryService;

    private final ReportSendService reportSendService;

    private final ShareRecipientService shareRecipientService;

    private final WhatsAppBlockService blockService;

    private final DashboardQueryService dashboardQueryService;

    private final PlanService planService;

    @Value("${app.timezone:Asia/Karachi}")
    private String timezone;

    @Scheduled(cron = "0 * * * * *")
    public void tick()
    {
        ZoneId zone = ZoneId.of(timezone);
        ZonedDateTime now = ZonedDateTime.now(zone);
        LocalDate today = now.toLocalDate();
        LocalTime minute = now.toLocalTime().truncatedTo(ChronoUnit.MINUTES);

        for (Store store : storeRepository.findBySuspendedAtIsNull())
        {
            ReportSettings reports = settingsOf(store);

            // One shop's failure is its own. Anything thrown while working out whether this
            // shop is due — a settings document that will not parse, a party that has gone
            // missing mid-tick — must not cost every shop after it in the list its report.
            try
            {
                if (reports.dailyEnabled() && reports.dailyAt().equals(minute))
                {
                    sendDaily(store, today, zone);
                }

                if (reports.reminderEnabled() && reports.reminderOn(today)
                        && reports.reminderAt().equals(minute))
                {
                    sendReminders(store, reports, today, zone);
                }
            }
            catch (RuntimeException e)
            {
                log.error("Scheduled reports failed for store {}", store.getId(), e);
            }
        }
    }

    /**
     * The shop's day, to its owner. Nothing goes out on a day nothing was recorded — the khata
     * and stock sections would still be full, so "was the shop open?" can only be read off the
     * day's own entries, which is what {@link DailyReportResponse#hasActivity()} asks.
     */
    private void sendDaily(Store store, LocalDate today, ZoneId zone)
    {
        User owner = store.getOwner();

        if (!planService.scheduledReportsOf(owner.getId()).dailyReports()
                || alreadyRan(store, WhatsAppSendSource.DAILY_REPORT, today, today, zone))
        {
            return;
        }

        DailyReportResponse report = reportQueryService.daily(store.getId(), today);
        if (!report.hasActivity())
        {
            log.debug("No activity on {} for store {}; no daily report sent", today, store.getId());
            return;
        }

        Optional<Addressee> to = reachable(store, owner.getId());
        if (to.isEmpty())
        {
            // A shop whose owner has no number we can message. Nothing was attempted, so there
            // is nothing to record — a FAILED row every night would say the same thing forever
            // about what is a setting, not a delivery.
            log.debug("Owner of store {} has no usable WhatsApp number; no daily report sent", store.getId());
            return;
        }

        String filename = ReportSendService.dailyFilename(today);

        if (blockService.in(store.getId()).has(owner.getId(), to.get().contact()))
        {
            reportSendService.recordBlocked(store, owner, to.get(), filename, WhatsAppSendSource.DAILY_REPORT);
            return;
        }

        reportSendService.send(store, owner, to.get(), ReportRequest.daily(store.getId(), today),
                DAILY_ACTION, filename, WhatsAppSendSource.DAILY_REPORT);
    }

    /**
     * The month's chasing. Who gets chased is the shop's own rule — owes at least this much, and
     * has had a bill unpaid at least this long — applied to the same FIFO staleness the
     * dashboard's "who owes me longest" list is built from, so the two can never disagree.
     *
     * <p>The plan's ceiling is applied to that list before anyone is looked up, so a shop over
     * its allowance chases the people who owe it most. A party inside the ceiling who has opted
     * out still uses their place in it: they are one of this shop's biggest debtors either way,
     * and skipping past them to chase somebody smaller would be the plan's limit quietly
     * meaning something else.
     */
    private void sendReminders(Store store, ReportSettings reports, LocalDate today, ZoneId zone)
    {
        User owner = store.getOwner();
        PlanLimits limits = planService.scheduledReportsOf(owner.getId());

        if (limits.reminderContacts() <= 0
                || alreadyRan(store, WhatsAppSendSource.REMINDER, today.withDayOfMonth(1), today, zone))
        {
            return;
        }

        List<StaleParty> due = dashboardQueryService.staleReceivables(store.getId(), today).stream()
                .filter(party -> party.amount() >= reports.reminderMinAmount())
                .filter(party -> party.daysStale() >= reports.reminderMinDaysStale())
                .limit(limits.reminderContacts())
                .toList();

        String filename = ReportSendService.reminderFilename(today);
        WhatsAppBlockService.Blocks blocks = blockService.in(store.getId());

        for (StaleParty party : due)
        {
            Optional<Addressee> to = reachable(store, party.partyId());
            if (to.isEmpty())
            {
                // A khata kept for a walk-in with no number on it. Common, and not a failure.
                continue;
            }

            if (blocks.has(party.partyId(), to.get().contact()))
            {
                reportSendService.recordBlocked(store, owner, to.get(), filename, WhatsAppSendSource.REMINDER);
                continue;
            }

            reportSendService.send(store, owner, to.get(),
                    ReportRequest.reminder(store.getId(), party.partyId(), today),
                    REMINDER_ACTION, filename, WhatsAppSendSource.REMINDER);
        }
    }

    /**
     * Whether this job has already run for this shop inside the window, whichever way it went.
     * See {@code WhatsAppSendRepository} for why this is asked of what was sent rather than of
     * a counter.
     */
    private boolean alreadyRan(Store store, WhatsAppSendSource source, LocalDate from, LocalDate to, ZoneId zone)
    {
        Instant start = from.atStartOfDay(zone).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(zone).toInstant();

        return sendRepository.existsByStoreIdAndSourceAndSentAtBetween(store.getId(), source, start, end);
    }

    /** The recipient behind an id, if this shop has a number that can actually be messaged. */
    private Optional<Addressee> reachable(Store store, String targetId)
    {
        return shareRecipientService.find(store, targetId)
                .filter(to -> DocumentShareService.isSendable(to.contact()));
    }

    /** A shop that has never been arranged sends nothing; see {@link StoreSettings}. */
    private static ReportSettings settingsOf(Store store)
    {
        return store.getSettings() != null ? store.getSettings().reports() : ReportSettings.DEFAULT;
    }
}
