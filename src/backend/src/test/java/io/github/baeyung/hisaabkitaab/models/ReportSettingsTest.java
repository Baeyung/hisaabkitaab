package io.github.baeyung.hisaabkitaab.models;

import java.time.LocalDate;
import java.time.LocalTime;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReportSettingsTest
{
    private static ReportSettings chasingOn(int day)
    {
        return new ReportSettings(false, "20:00", true, day, "10:00", 0, 30);
    }

    @Test
    void aShopThatHasNeverBeenArrangedSendsNothing()
    {
        assertFalse(ReportSettings.DEFAULT.dailyEnabled());
        assertFalse(ReportSettings.DEFAULT.reminderEnabled());
    }

    @Test
    void chasesOnTheDayItWasGiven()
    {
        assertTrue(chasingOn(5).reminderOn(LocalDate.of(2026, 8, 5)));
        assertFalse(chasingOn(5).reminderOn(LocalDate.of(2026, 8, 6)));
    }

    /**
     * The whole reason the day is clamped rather than matched: a shop chasing on the 31st has
     * asked for month end, and a February that simply skipped the month would be the setting
     * quietly meaning something else.
     */
    @Test
    void theThirtyFirstMeansTheLastDayOfWhateverMonthItIs()
    {
        assertTrue(chasingOn(31).reminderOn(LocalDate.of(2026, 2, 28)));
        assertTrue(chasingOn(31).reminderOn(LocalDate.of(2024, 2, 29)));
        assertTrue(chasingOn(31).reminderOn(LocalDate.of(2026, 4, 30)));
        assertTrue(chasingOn(31).reminderOn(LocalDate.of(2026, 8, 31)));
    }

    /** And it is the last day only — not every day at the end of a short month. */
    @Test
    void aClampedDayDoesNotFireTwice()
    {
        assertFalse(chasingOn(31).reminderOn(LocalDate.of(2026, 4, 29)));
        assertFalse(chasingOn(30).reminderOn(LocalDate.of(2026, 2, 27)));
        assertTrue(chasingOn(30).reminderOn(LocalDate.of(2026, 2, 28)));
    }

    /** A document stored before this record existed arrives with none of its fields set. */
    @Test
    void anAbsentDocumentReadsAsTheDefaults()
    {
        ReportSettings blank = new ReportSettings(false, null, false, 0, "", 0, 0);

        assertEquals(LocalTime.of(20, 0), blank.dailyAt());
        assertEquals(LocalTime.of(10, 0), blank.reminderAt());
        assertEquals(31, blank.reminderDay());
    }
}
