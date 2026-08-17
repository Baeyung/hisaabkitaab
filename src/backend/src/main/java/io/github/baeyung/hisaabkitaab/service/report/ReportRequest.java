package io.github.baeyung.hisaabkitaab.service.report;

import java.time.LocalDate;

/**
 * One report, named: which kind, whose shop, which day, and — for a reminder — whose khata.
 *
 * <p>This exists so that the three spellings of a report cannot drift apart. The job builds a
 * page URL from it, signs {@link #subject()} into the token that goes with it, and the endpoint
 * rebuilds the same subject from its own path to check that token. If those were written out
 * separately, a token minted for one report would quietly verify against another — the subject
 * is the only thing standing between "this shop's report" and "any shop's report", so it is
 * derived once, here.
 */
public record ReportRequest(ReportKind kind, String storeId, String partyId, LocalDate date)
{
    public static ReportRequest daily(String storeId, LocalDate date)
    {
        return new ReportRequest(ReportKind.DAILY, storeId, null, date);
    }

    public static ReportRequest reminder(String storeId, String partyId, LocalDate date)
    {
        return new ReportRequest(ReportKind.REMINDER, storeId, partyId, date);
    }

    /**
     * What the token is signed over: everything that decides which report this is. A token good
     * for one shop on one day is good for nothing else.
     */
    public String subject()
    {
        return kind == ReportKind.REMINDER
                ? "reminder|" + storeId + "|" + partyId + "|" + date
                : "daily|" + storeId + "|" + date;
    }

    /**
     * The app's own route for this report, which is what the renderer is pointed at. The token
     * rides in the path rather than in a query string so that it survives the router without
     * anything having to preserve query parameters, and reads the same way as {@code /block/…}
     * — the other page in this app whose URL is its whole credential.
     */
    public String pagePath(String token)
    {
        return kind == ReportKind.REMINDER
                ? "/report/reminder/" + storeId + "/" + partyId + "/" + date + "/" + token
                : "/report/daily/" + storeId + "/" + date + "/" + token;
    }
}
