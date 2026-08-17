package io.github.baeyung.hisaabkitaab.service.report;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The tenant boundary for the open report endpoints. {@code CurrentStoreArgumentResolver} is
 * what keeps one shop's books out of another's everywhere else in the app; on these two routes
 * there is no signed-in user for it to check, and this is what stands in its place — so what is
 * asserted here is mostly what it refuses.
 */
class ReportTokenServiceTest
{
    private static final LocalDate DAY = LocalDate.of(2026, 8, 17);

    private final ReportTokenService tokens = new ReportTokenService("test-secret");

    @Test
    void aFreshTokenIsGoodForItsOwnSubject()
    {
        ReportRequest request = ReportRequest.daily("store-1", DAY);

        assertTrue(tokens.isValid(request.subject(), tokens.mint(request.subject())));
    }

    /** The point of signing the store id: a token for one shop must not open another's day. */
    @Test
    void aTokenForOneShopIsNoGoodForAnother()
    {
        String token = tokens.mint(ReportRequest.daily("store-1", DAY).subject());

        assertFalse(tokens.isValid(ReportRequest.daily("store-2", DAY).subject(), token));
    }

    /** And the date, so yesterday's link cannot be replayed for today's books. */
    @Test
    void aTokenForOneDayIsNoGoodForAnother()
    {
        String token = tokens.mint(ReportRequest.daily("store-1", DAY).subject());

        assertFalse(tokens.isValid(ReportRequest.daily("store-1", DAY.plusDays(1)).subject(), token));
    }

    /** And the party, so a customer's own reminder link cannot fetch the shop's other khatas. */
    @Test
    void aReminderTokenIsNoGoodForAnotherParty()
    {
        String token = tokens.mint(ReportRequest.reminder("store-1", "party-1", DAY).subject());

        assertFalse(tokens.isValid(
                ReportRequest.reminder("store-1", "party-2", DAY).subject(), token));
    }

    /** A daily token must not open a reminder, however much of the subject it shares. */
    @Test
    void oneKindOfReportDoesNotUnlockTheOther()
    {
        String token = tokens.mint(ReportRequest.daily("store-1", DAY).subject());

        assertFalse(tokens.isValid(
                ReportRequest.reminder("store-1", "party-1", DAY).subject(), token));
    }

    @Test
    void anExpiredTokenIsRefused()
    {
        // Minted by hand with a stamp in the past — the signature is over the expiry too, so a
        // token cannot be given a longer life by whoever is holding it.
        String subject = ReportRequest.daily("store-1", DAY).subject();
        String live = tokens.mint(subject);
        String expired = "1000000000" + live.substring(live.indexOf('.'));

        assertFalse(tokens.isValid(subject, expired));
    }

    @Test
    void aTamperedOrMissingSignatureIsRefused()
    {
        String subject = ReportRequest.daily("store-1", DAY).subject();
        String token = tokens.mint(subject);

        assertFalse(tokens.isValid(subject, token.substring(0, token.length() - 1)));
        assertFalse(tokens.isValid(subject, token.substring(0, token.indexOf('.'))));
        assertFalse(tokens.isValid(subject, "not-a-token"));
        assertFalse(tokens.isValid(subject, null));
    }

    /** A different process signs with a different key, so its tokens mean nothing here. */
    @Test
    void aTokenFromAnotherKeyIsRefused()
    {
        String subject = ReportRequest.daily("store-1", DAY).subject();

        assertFalse(tokens.isValid(subject, new ReportTokenService("other-secret").mint(subject)));
    }
}
