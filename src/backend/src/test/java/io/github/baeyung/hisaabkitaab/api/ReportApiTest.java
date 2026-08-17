package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

import io.github.baeyung.hisaabkitaab.service.report.ReportRequest;
import io.github.baeyung.hisaabkitaab.service.report.ReportTokenService;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The open report endpoints — the pages headless Chrome is pointed at to turn a scheduled
 * report into a PDF.
 *
 * <p>These are the only store-scoped routes in the application that {@code @CurrentStore} does
 * not guard, because the caller is a browser with nobody signed in. What replaces it is the
 * signed token, so most of what is worth asserting here is that the shop's books stay shut
 * without one — including to a perfectly ordinary signed-in user of another shop, who is the
 * realistic attacker rather than an anonymous stranger.
 */
@TestPropertySource(properties = "app.reports.secret=test-secret")
class ReportApiTest extends ApiTest
{
    private static final String OWNER = "3492000001";

    private static final String OUTSIDER = "3492000002";

    private static final LocalDate TODAY = LocalDate.now();

    @Autowired
    private ReportTokenService tokens;

    private String bearer(ReportRequest request)
    {
        return "Bearer " + tokens.mint(request.subject());
    }

    private static String daily(String storeId)
    {
        return "/api/reports/daily/" + storeId + "/" + TODAY;
    }

    @Test
    void aSignedTokenOpensThatShopsDay() throws Exception
    {
        signup(OWNER);
        String storeId = createStore(OWNER, "Kiryana Store");

        mvc.perform(get(daily(storeId))
                .header("Authorization", bearer(ReportRequest.daily(storeId, TODAY))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.store.name").value("Kiryana Store"))
                // Every section the report prints, so a missing one is a failing test rather
                // than a silently blank page in somebody's WhatsApp.
                .andExpect(jsonPath("$.cashbook").exists())
                .andExpect(jsonPath("$.bills").isArray())
                .andExpect(jsonPath("$.purchases").isArray())
                .andExpect(jsonPath("$.parties").isArray())
                .andExpect(jsonPath("$.stock").isArray());
    }

    /** No credential at all. The route is public; the token is the whole of the gate. */
    @Test
    void withoutATokenItRefuses() throws Exception
    {
        signup(OWNER);
        String storeId = createStore(OWNER, "Kiryana Store");

        mvc.perform(get(daily(storeId))).andExpect(status().isUnauthorized());
        mvc.perform(get(daily(storeId)).header("Authorization", "Bearer nonsense"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * The one that matters. A signed-in user with a shop of their own holds a real token for
     * it — and it must not open anybody else's, which is exactly what signing the store id
     * into the subject buys.
     */
    @Test
    void aTokenForOnesOwnShopDoesNotOpenAnothers() throws Exception
    {
        signup(OWNER);
        String theirs = createStore(OWNER, "Kiryana Store");

        signup(OUTSIDER);
        String mine = createStore(OUTSIDER, "Cloth House");

        mvc.perform(get(daily(theirs))
                .header("Authorization", bearer(ReportRequest.daily(mine, TODAY))))
                .andExpect(status().isUnauthorized());
    }

    /** Signing in is not a way past it either: this route does not read accounts at all. */
    @Test
    void beingSignedInIsNotACredentialHere() throws Exception
    {
        signup(OWNER);
        String storeId = createStore(OWNER, "Kiryana Store");

        mvc.perform(get(daily(storeId)).with(as(OWNER))).andExpect(status().isUnauthorized());
    }

    /** A token minted for the day's books must not fetch a customer's khata. */
    @Test
    void aDailyTokenDoesNotOpenAReminder() throws Exception
    {
        signup(OWNER);
        String storeId = createStore(OWNER, "Kiryana Store");

        mvc.perform(get("/api/reports/reminder/" + storeId + "/party-1/" + TODAY)
                .header("Authorization", bearer(ReportRequest.daily(storeId, TODAY))))
                .andExpect(status().isUnauthorized());
    }
}
