package io.github.baeyung.hisaabkitaab.service.report;

/** The two things the scheduler sends; see {@code ReportSettings} for when each one goes. */
public enum ReportKind
{
    /** The shop's day, to its owner, every evening. */
    DAILY,

    /** A khata holder's statement, to them, once a month. */
    REMINDER
}
