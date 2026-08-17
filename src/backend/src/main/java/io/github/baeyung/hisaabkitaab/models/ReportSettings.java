package io.github.baeyung.hisaabkitaab.models;

import java.time.LocalDate;
import java.time.LocalTime;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * When this shop's reports go out, and who the reminders chase. Part of {@link StoreSettings},
 * and the one part of it the backend genuinely reads — see that class for why the rest is
 * opaque.
 *
 * <p>Both jobs are off until an owner turns them on. A shop that has never opened this screen
 * sends nothing, which is the only safe default for something that puts messages on other
 * people's phones: a shop mid-onboarding, with half its khatas keyed in, must not start
 * chasing customers over balances that are not yet true.
 *
 * <p>Times are {@code "HH:mm"} strings rather than {@link LocalTime}s because that is exactly
 * what {@code <input type="time">} produces and what this is stored as — one shape from the
 * form to the JSON column, with no serialisation format to agree on. {@link #dailyAt()} and
 * {@link #reminderAt()} are the only places they are read as times.
 *
 * @param dailyEnabled          whether the daily report goes to this shop's owner at all.
 * @param dailyTime             when, in the shop's timezone ({@code app.timezone}). Evening by
 *                              default — the report is the day's close, so it wants the day
 *                              finished.
 * @param reminderEnabled       whether this shop chases its khata holders monthly.
 * @param reminderDay           day of the month to chase on, clamped by {@link #reminderOn} to
 *                              the month's real length — so 31 means "last day", every month.
 * @param reminderTime          when on that day. Mid-morning by default: a reminder that
 *                              arrives while the shop is open is one the customer can answer.
 * @param reminderMinAmount     only chase a party owing at least this much. Zero chases every
 *                              party in debt, however small.
 * @param reminderMinDaysStale  only chase when their oldest unpaid bill has sat this long.
 *                              Measured by FIFO settlement, not by the last payment received —
 *                              see {@code ReceivableAging}, and note that a party paying a
 *                              token amount monthly against an old bill is still stale here,
 *                              which is the point.
 */
public record ReportSettings(
        boolean dailyEnabled,
        @Pattern(regexp = "([01]\\d|2[0-3]):[0-5]\\d") String dailyTime,
        boolean reminderEnabled,
        @Min(1) @Max(31) int reminderDay,
        @Pattern(regexp = "([01]\\d|2[0-3]):[0-5]\\d") String reminderTime,
        @PositiveOrZero double reminderMinAmount,
        @PositiveOrZero @Max(3650) int reminderMinDaysStale)
{
    /** What a shop that has never opened the reports screen means: nothing goes out. */
    public static final ReportSettings DEFAULT = new ReportSettings(
            false, "20:00", false, 31, "10:00", 0, 30);

    /**
     * Null-safe and range-safe by construction, mirroring {@link StoreSettings}. A stored
     * document written before this record existed has none of these fields, so every one of
     * them has to survive arriving absent.
     */
    public ReportSettings
    {
        dailyTime = dailyTime == null || dailyTime.isBlank() ? "20:00" : dailyTime;
        reminderTime = reminderTime == null || reminderTime.isBlank() ? "10:00" : reminderTime;
        reminderDay = reminderDay < 1 || reminderDay > 31 ? 31 : reminderDay;
    }

    public LocalTime dailyAt()
    {
        return LocalTime.parse(dailyTime);
    }

    public LocalTime reminderAt()
    {
        return LocalTime.parse(reminderTime);
    }

    /**
     * Whether {@code date} is this shop's chasing day. {@link #reminderDay} is clamped to the
     * month's own length rather than skipped, so a shop that chases on the 31st chases on the
     * 28th of February instead of missing the month — which is what "month end" means to the
     * shopkeeper who picked it.
     */
    public boolean reminderOn(LocalDate date)
    {
        return date.getDayOfMonth() == Math.min(reminderDay, date.lengthOfMonth());
    }
}
