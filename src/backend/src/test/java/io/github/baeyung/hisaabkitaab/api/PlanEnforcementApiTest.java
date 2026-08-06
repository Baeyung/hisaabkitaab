package io.github.baeyung.hisaabkitaab.api;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

import io.github.baeyung.hisaabkitaab.entity.UserPlan;
import io.github.baeyung.hisaabkitaab.enums.PlanTier;
import io.github.baeyung.hisaabkitaab.repository.UserPlanRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Plan enforcement with the feature switched on: the ceilings on shops and users, the lockout
 * when a plan runs out, and the one case where a lapsed user is still let through.
 *
 * <p>Plans are written here through {@link UserPlanRepository} rather than the admin API. The
 * admin path has its own tests, and it cannot express a plan that has <em>already</em> expired
 * ({@code AssignPlanRequest.expiresAt} is {@code @Future}) — which is the state most of this
 * class is about.
 */
@TestPropertySource(properties = {
        "app.plans.enabled=true",
        // signup() derives the email from the contact number, so this names ADMIN's account.
        "app.admin.emails=u3500000009@x.com"
})
class PlanEnforcementApiTest extends ApiTest
{
    private static final String ADMIN = "3500000009";

    @Autowired
    private UserPlanRepository userPlanRepository;

    /** Puts a plan on an account directly, expiring on the given day (or never, if null). */
    private void plan(String userId, PlanTier tier, LocalDate expiresAt)
    {
        userPlanRepository.save(UserPlan.builder()
                .userId(userId)
                .tier(tier)
                .assignedAt(Instant.now())
                .expiresAt(expiresAt)
                .build());
    }

    private void expire(String userId)
    {
        plan(userId, PlanTier.TRIAL, LocalDate.now().minusDays(1));
    }

    private ResultActions createStoreAttempt(String actor, String name)
            throws Exception
    {
        return mvc.perform(post("/api/stores").with(as(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"%s\"}".formatted(name)));
    }

    private ResultActions inviteAttempt(String owner, String store,
            String email) throws Exception
    {
        return mvc.perform(post(api(store, "/members")).with(as(owner))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"role\":\"EDITOR\"}".formatted(email)));
    }

    /** A trial carries Basic's single shop, so the second one is refused. */
    @Test
    void trialAllowsOneShopOnly() throws Exception
    {
        signup("3500000001");

        createStoreAttempt("3500000001", "First").andExpect(status().isOk());
        createStoreAttempt("3500000001", "Second").andExpect(status().isForbidden());
    }

    /**
     * {@code maxUsers} counts the owner, so a one-user plan means the owner working alone and
     * has no room for even a single invite. The refusal has to come from the plan and not from
     * anything about the invitee, so this invites a perfectly valid stranger.
     */
    @Test
    void trialCannotInviteAnyoneBecauseTheOwnerIsTheOneUser() throws Exception
    {
        signup("3500000002");
        String store = createStore("3500000002", "Shop");

        inviteAttempt("3500000002", store, "someone@x.com").andExpect(status().isForbidden());
    }

    /** A bigger plan lifts the ceiling, and the ceiling is still real one shop higher up. */
    @Test
    void premiumAllowsTwoShopsAndNoMore() throws Exception
    {
        String user = signup("3500000003");
        plan(user, PlanTier.PREMIUM, LocalDate.now().plusYears(1));

        createStoreAttempt("3500000003", "First").andExpect(status().isOk());
        createStoreAttempt("3500000003", "Second").andExpect(status().isOk());
        createStoreAttempt("3500000003", "Third").andExpect(status().isForbidden());
    }

    /**
     * The users limit is counted across everything the owner owns, not per shop: two shops on
     * Premium share one allowance of three, so the owner plus two invitees fills it however the
     * two are spread. Someone invited to both shops still counts once.
     */
    @Test
    void usersAreCountedDistinctlyAcrossAllTheOwnersShops() throws Exception
    {
        String user = signup("3500000004");
        plan(user, PlanTier.PREMIUM, LocalDate.now().plusYears(1));

        String first = createStore("3500000004", "First");
        String second = createStore("3500000004", "Second");

        // owner + alice + bob = 3, which is Premium's whole allowance.
        inviteAttempt("3500000004", first, "alice@x.com").andExpect(status().isOk());
        inviteAttempt("3500000004", second, "bob@x.com").andExpect(status().isOk());

        // Alice again in the other shop is the same person, so it still fits.
        inviteAttempt("3500000004", second, "alice@x.com").andExpect(status().isOk());

        // A fourth person does not, in either shop.
        inviteAttempt("3500000004", first, "carol@x.com").andExpect(status().isForbidden());
        inviteAttempt("3500000004", second, "carol@x.com").andExpect(status().isForbidden());
    }

    /** A plan that has run out stops being an account you can sign in to at all. */
    @Test
    void expiredPlanCannotSignIn() throws Exception
    {
        String user = signup("3500000005");
        expire(user);

        mvc.perform(get("/api/stores").with(as("3500000005")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("PLAN_EXPIRED"));
    }

    /**
     * The borrowed-plan rule, and the line it stops at. Someone invited into a paid-up owner's
     * shop keeps working there after their own trial lapses — they are inside an account that
     * was paid for. What they cannot do is start something of their own on the strength of
     * somebody else's plan.
     */
    @Test
    void lapsedMemberKeepsWorkingInAPaidShopButCannotOpenTheirOwn() throws Exception
    {
        String owner = signup("3500000006");
        plan(owner, PlanTier.PREMIUM, LocalDate.now().plusYears(1));
        String store = createStore("3500000006", "Owner's shop");

        String member = signup("3500000007");
        inviteAttempt("3500000006", store, "u3500000007@x.com").andExpect(status().isOk());
        expire(member);

        // Still gets in, and still sees the shop they were invited into.
        mvc.perform(get("/api/stores").with(as("3500000007")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(store));

        // But their own plan is what pays for anything new, and it has run out.
        createStoreAttempt("3500000007", "Their own shop").andExpect(status().isForbidden());
    }

    /**
     * The clock starts on the account's own next request, not when the plan row was written —
     * so the trial someone gets is fifteen days of the product, not fifteen days of whenever
     * the feature happened to be switched on.
     */
    @Test
    void trialClockStartsOnTheAccountsNextRequest() throws Exception
    {
        String user = signup("3500000008");
        assertNull(userPlanRepository.findById(user).orElseThrow().getExpiresAt(),
                "signup alone must not start the clock");

        mvc.perform(get("/api/stores").with(as("3500000008"))).andExpect(status().isOk());

        assertEquals(LocalDate.now().plusDays(15),
                userPlanRepository.findById(user).orElseThrow().getExpiresAt());
    }

    /**
     * An admin's own plan does not gate the back office. Admins are ordinary accounts named in
     * configuration, and the back office is where a lapsed plan gets renewed — so letting one
     * lock the other would leave a restart as the only way back in.
     */
    @Test
    void adminWithALapsedPlanStillReachesTheBackOffice() throws Exception
    {
        String admin = signup(ADMIN);
        expire(admin);

        mvc.perform(get("/api/admin/users").with(as(ADMIN)))
                .andExpect(status().isOk());
    }
}
