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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
     * so the trial someone gets is a month of the product, not a month of whenever the feature
     * happened to be switched on.
     */
    @Test
    void trialClockStartsOnTheAccountsNextRequest() throws Exception
    {
        String user = signup("3500000008");
        assertNull(userPlanRepository.findById(user).orElseThrow().getExpiresAt(),
                "signup alone must not start the clock");

        mvc.perform(get("/api/stores").with(as("3500000008"))).andExpect(status().isOk());

        assertEquals(LocalDate.now().plusMonths(1),
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

    /**
     * An account on a plan covering two shops, with both open.
     *
     * @return the user's id first, then each shop's. The id is needed because changing the
     *         plan out from under an account is the only way to produce an over-limit one —
     *         every path that adds is already refused at the ceiling.
     */
    private String[] twoShopsOnPremium(String contact) throws Exception
    {
        String user = signup(contact);
        plan(user, PlanTier.PREMIUM, LocalDate.now().plusYears(1));

        return new String[] { user, createStore(contact, "First"), createStore(contact, "Second") };
    }

    /** Drops the account to a tier covering one shop, which is what puts it over its limit. */
    private void downgradeToTrial(String userId)
    {
        plan(userId, PlanTier.TRIAL, LocalDate.now().plusYears(1));
    }

    private ResultActions keepOnly(String actor, String... storeIds) throws Exception
    {
        String ids = storeIds.length == 0 ? "" : "\"" + String.join("\",\"", storeIds) + "\"";

        return mvc.perform(put("/api/plan/overage").with(as(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"keepStoreIds\":[%s]}".formatted(ids)));
    }

    /** Any old write into a shop — this is about whether writing is allowed, not about parties. */
    private ResultActions addParty(String actor, String store) throws Exception
    {
        return mvc.perform(post(api(store, "/parties")).with(as(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Someone\"}"));
    }

    /**
     * The whole point of the feature. An account dropped onto a smaller plan is stopped from
     * writing anywhere until it says what it is keeping — but never stopped from reading, and
     * nothing of theirs is destroyed to get them out of it.
     */
    @Test
    void anAccountOverItsLimitIsReadOnlyUntilItChoosesWhatToKeep() throws Exception
    {
        String[] ids = twoShopsOnPremium("3500000010");
        downgradeToTrial(ids[0]);

        // Two shops open against a ceiling of one: every write is refused, in both shops.
        addParty("3500000010", ids[1]).andExpect(status().isForbidden());
        addParty("3500000010", ids[2]).andExpect(status().isForbidden());

        // Reading is untouched. A billing change must never take somebody's books away.
        mvc.perform(get(api(ids[1], "/parties")).with(as("3500000010")))
                .andExpect(status().isOk());

        keepOnly("3500000010", ids[1]).andExpect(status().isOk());

        // The kept shop works again...
        addParty("3500000010", ids[1]).andExpect(status().isOk());
        // ...and the closed one is still readable, just not writable. Not deleted.
        mvc.perform(get(api(ids[2], "/parties")).with(as("3500000010")))
                .andExpect(status().isOk());
        addParty("3500000010", ids[2]).andExpect(status().isForbidden());
    }

    /**
     * Once settled, the choice cannot be made again — otherwise a one-shop plan buys every
     * shop, one at a time: close the kept one, open the next, carry on working.
     */
    @Test
    void shopsCannotBeSwappedOnceTheOverageIsSettled() throws Exception
    {
        String[] ids = twoShopsOnPremium("3500000016");
        downgradeToTrial(ids[0]);
        keepOnly("3500000016", ids[1]).andExpect(status().isOk());

        keepOnly("3500000016", ids[2]).andExpect(status().isConflict());
        addParty("3500000016", ids[2]).andExpect(status().isForbidden());
    }

    /** Keeping more than the plan covers is refused, so the overage cannot be resolved by lying. */
    @Test
    void keepingMoreShopsThanThePlanCoversIsRefused() throws Exception
    {
        String[] ids = twoShopsOnPremium("3500000011");
        downgradeToTrial(ids[0]);

        keepOnly("3500000011", ids[1], ids[2]).andExpect(status().isBadRequest());
    }

    /**
     * Deleting a closed shop has to stay possible, or an owner who has resolved their overage
     * is left with a shop they can neither work in nor be rid of — refused by the very check
     * that being over the limit produced.
     */
    @Test
    void aClosedShopCanStillBeDeleted() throws Exception
    {
        String[] ids = twoShopsOnPremium("3500000012");
        downgradeToTrial(ids[0]);
        keepOnly("3500000012", ids[1]).andExpect(status().isOk());

        mvc.perform(delete("/api/stores/" + ids[2]).with(as("3500000012")))
                .andExpect(status().isNoContent());
    }

    /**
     * Paying more gives the shops back without the customer having to find a screen — the
     * alternative is an upgrade that visibly changes nothing, which reads as not having worked.
     */
    @Test
    void raisingThePlanReopensTheShopsItNowCovers() throws Exception
    {
        String[] ids = twoShopsOnPremium("3500000013");
        downgradeToTrial(ids[0]);
        keepOnly("3500000013", ids[1]).andExpect(status().isOk());

        addParty("3500000013", ids[2]).andExpect(status().isForbidden());

        // Through the admin API, because being re-opened by an actual upgrade is the claim.
        signup(ADMIN);
        mvc.perform(put("/api/admin/users/" + ids[0] + "/plan").with(as(ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tier\":\"PREMIUM\",\"expiresAt\":\"%s\"}"
                                .formatted(LocalDate.now().plusYears(1))))
                .andExpect(status().isOk());

        addParty("3500000013", ids[2]).andExpect(status().isOk());
    }

    /**
     * A closed shop's people stop costing a seat, so closing one shop can settle both ceilings
     * at once. An owner made to remove staff they were about to lose anyway would be doing work
     * the plan never actually asked of them.
     */
    @Test
    void closingAShopFreesTheSeatsOfThePeopleOnlyInIt() throws Exception
    {
        String user = signup("3500000014");
        plan(user, PlanTier.PREMIUM, LocalDate.now().plusYears(1));

        String first = createStore("3500000014", "First");
        String second = createStore("3500000014", "Second");
        inviteAttempt("3500000014", second, "onlyhere@x.com").andExpect(status().isOk());

        // owner + one member = 2, which is over TRIAL's ceiling of one.
        downgradeToTrial(user);
        mvc.perform(get("/api/plan/me").with(as("3500000014")))
                .andExpect(jsonPath("$.usage.users").value(2));

        // Closing the shop that person was in takes them out of the count with it.
        keepOnly("3500000014", first).andExpect(status().isOk());
        mvc.perform(get("/api/plan/me").with(as("3500000014")))
                .andExpect(jsonPath("$.usage.users").value(1))
                .andExpect(jsonPath("$.usage.stores").value(1));

        addParty("3500000014", first).andExpect(status().isOk());
    }

    /** The screen's own feed: every shop, open or closed, and each person exactly once. */
    @Test
    void theOverageScreenListsEveryShopAndEachPersonOnce() throws Exception
    {
        String user = signup("3500000015");
        plan(user, PlanTier.PREMIUM, LocalDate.now().plusYears(1));

        String first = createStore("3500000015", "First");
        String second = createStore("3500000015", "Second");
        // The same person in both shops is one seat, so they must be one row.
        inviteAttempt("3500000015", first, "both@x.com").andExpect(status().isOk());
        inviteAttempt("3500000015", second, "both@x.com").andExpect(status().isOk());

        downgradeToTrial(user);
        keepOnly("3500000015", first).andExpect(status().isOk());

        mvc.perform(get("/api/plan/overage").with(as("3500000015")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stores.length()").value(2))
                .andExpect(jsonPath("$.people.length()").value(1))
                .andExpect(jsonPath("$.people[0].storeIds.length()").value(2));
    }
}
