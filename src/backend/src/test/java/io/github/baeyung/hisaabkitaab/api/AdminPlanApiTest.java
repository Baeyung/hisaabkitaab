package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /api/admin — the back office, run with plans switched on and one account named as an admin.
 *
 * <p>Two things are being proved: that the admin wall holds (a perfectly ordinary logged-in
 * user cannot see or change anyone's plan), and that a plan resolves the way it is meant to —
 * tier defaults unless an override says otherwise, and a fresh signup landing on a trial.
 */
@TestPropertySource(properties = {
        "app.plans.enabled=true",
        // signup() derives the email from the contact number, so this names ADMIN's account.
        "app.admin.emails=u3400000900@x.com"
})
class AdminPlanApiTest extends ApiTest
{
    private static final String ADMIN = "3400000900";

    /** A date comfortably inside @Future, whatever day the suite runs on. */
    private static final LocalDate NEXT_YEAR = LocalDate.now().plusYears(1);

    private ResultActions assignPlan(String actor, String userId, String body) throws Exception
    {
        return mvc.perform(put("/api/admin/users/" + userId + "/plan").with(as(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void ordinaryUserCannotReachTheBackOffice() throws Exception
    {
        signup(ADMIN);
        String outsider = signup("3400000901");

        mvc.perform(get("/api/admin/users").with(as("3400000901")))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/admin/plan-tiers").with(as("3400000901")))
                .andExpect(status().isForbidden());

        // And most of all, cannot hand themselves a bigger plan.
        assignPlan("3400000901", outsider, """
                {"tier":"ENTERPRISE","expiresAt":"%s"}
                """.formatted(NEXT_YEAR))
                .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedIsRefused() throws Exception
    {
        mvc.perform(get("/api/admin/users"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * A signup gets a trial, but not a running one: until something enforces plans, the clock
     * would only burn down a trial nobody could renew or pay out of.
     */
    @Test
    void signupStartsATrialWithNoWhatsappAndNoClock() throws Exception
    {
        signup(ADMIN);
        signup("3400000902");

        mvc.perform(get("/api/admin/users").param("q", "u3400000902@x.com").with(as(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].plan.tier").value("TRIAL"))
                .andExpect(jsonPath("$[0].plan.expiresAt").doesNotExist())
                .andExpect(jsonPath("$[0].plan.expired").value(false))
                // Basic's shape, minus the WhatsApp allowance — that is what makes it a trial.
                .andExpect(jsonPath("$[0].plan.limits.maxStores").value(1))
                .andExpect(jsonPath("$[0].plan.limits.maxUsers").value(1))
                .andExpect(jsonPath("$[0].plan.limits.whatsappQuota").value(0));
    }

    @Test
    void adminAssignsATierAndItsDefaultsApply() throws Exception
    {
        signup(ADMIN);
        String target = signup("3400000903");

        assignPlan(ADMIN, target, """
                {"tier":"PREMIUM","expiresAt":"%s"}
                """.formatted(NEXT_YEAR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("PREMIUM"))
                .andExpect(jsonPath("$.expiresAt").value(NEXT_YEAR.toString()))
                .andExpect(jsonPath("$.limits.maxStores").value(2))
                .andExpect(jsonPath("$.limits.maxUsers").value(3))
                .andExpect(jsonPath("$.limits.whatsappQuota").value(150))
                // Nothing was set by hand, so nothing is reported as an override.
                .andExpect(jsonPath("$.overrides.maxStores").doesNotExist())
                .andExpect(jsonPath("$.overrides.whatsappQuota").doesNotExist());
    }

    @Test
    void overridesBeatTierDefaultsAndAreReportedAsOverrides() throws Exception
    {
        signup(ADMIN);
        String target = signup("3400000904");

        assignPlan(ADMIN, target, """
                {"tier":"ENTERPRISE","expiresAt":"%s","maxStores":40,"whatsappQuota":9000}
                """.formatted(NEXT_YEAR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limits.maxStores").value(40))
                .andExpect(jsonPath("$.limits.whatsappQuota").value(9000))
                // Untouched, so it still comes from the tier.
                .andExpect(jsonPath("$.limits.maxUsers").value(8))
                .andExpect(jsonPath("$.overrides.maxStores").value(40))
                .andExpect(jsonPath("$.overrides.maxUsers").doesNotExist());
    }

    /**
     * An assignment states the whole plan. Moving an Enterprise account back to a standard
     * tier must not leave its bespoke limits behind — that would be a customer quietly keeping
     * 40 stores on Basic.
     */
    @Test
    void reassigningClearsPreviousOverrides() throws Exception
    {
        signup(ADMIN);
        String target = signup("3400000905");

        assignPlan(ADMIN, target, """
                {"tier":"ENTERPRISE","expiresAt":"%s","maxStores":40}
                """.formatted(NEXT_YEAR))
                .andExpect(status().isOk());

        assignPlan(ADMIN, target, """
                {"tier":"BASIC","expiresAt":"%s"}
                """.formatted(NEXT_YEAR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limits.maxStores").value(1))
                .andExpect(jsonPath("$.overrides.maxStores").doesNotExist());
    }

    @Test
    void assignmentRequiresATierAndAFutureExpiry() throws Exception
    {
        signup(ADMIN);
        String target = signup("3400000906");

        assignPlan(ADMIN, target, """
                {"expiresAt":"%s"}
                """.formatted(NEXT_YEAR))
                .andExpect(status().isBadRequest());

        assignPlan(ADMIN, target, """
                {"tier":"BASIC","expiresAt":"2020-01-01"}
                """)
                .andExpect(status().isBadRequest());
    }

    @Test
    void assigningToSomeoneWhoDoesNotExistIs404() throws Exception
    {
        signup(ADMIN);

        assignPlan(ADMIN, "no-such-user", """
                {"tier":"BASIC","expiresAt":"%s"}
                """.formatted(NEXT_YEAR))
                .andExpect(status().isNotFound());
    }

    @Test
    void userSearchMatchesNameEmailAndNumberAndEmptyMatchesAll() throws Exception
    {
        signup(ADMIN);
        signup("3400000907");

        mvc.perform(get("/api/admin/users").param("q", "3400000907").with(as(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].contactNumber").value("3400000907"));

        mvc.perform(get("/api/admin/users").param("q", "U3400000907@X.COM").with(as(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        MvcResult all = mvc.perform(get("/api/admin/users").with(as(ADMIN)))
                .andExpect(status().isOk())
                .andReturn();
        assertTrue(tree(all).size() >= 2, "no query should list every account");
    }

    @Test
    void planTiersPublishesTheCatalogue() throws Exception
    {
        signup(ADMIN);

        mvc.perform(get("/api/admin/plan-tiers").with(as(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[?(@.tier=='PREMIUM_PLUS')].maxStores").value(6));
    }
}
