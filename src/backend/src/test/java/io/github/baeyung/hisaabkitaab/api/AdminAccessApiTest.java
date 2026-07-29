package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import io.github.baeyung.hisaabkitaab.admin.AccountAccessEventRepository;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Admin rights come from configuration, not the database, and the one thing an admin can do
 * so far is shut an account. A shut account is refused everywhere at once — Basic auth
 * re-checks on every request, so there is no session left holding the door open.
 */
@TestPropertySource(properties = "app.admin.emails=u3005550001@x.com")
class AdminAccessApiTest extends ApiTest
{
    /** Matches the email {@code ApiTest.signup} derives, so this contact number is the admin. */
    private static final String ADMIN = "3005550001";

    @Autowired
    private UserRepository users;

    @Autowired
    private AccountAccessEventRepository events;

    private void setAccess(String targetId, boolean disabled, String reason, int expectedStatus) throws Exception
    {
        mvc.perform(put("/api/admin/users/" + targetId + "/access").with(as(ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"disabled\":%s,\"reason\":\"%s\"}".formatted(disabled, reason)))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    void aConfiguredAdminReachesTheAdminApi() throws Exception
    {
        signup(ADMIN);

        mvc.perform(get("/api/admin/users").with(as(ADMIN)))
                .andExpect(status().isOk());
    }

    @Test
    void anOrdinaryUserIsForbiddenFromTheAdminApi() throws Exception
    {
        String user = "3005550002";
        signup(user);

        // 403, not 404: the password was fine, the role was not. The admin app reads this to
        // tell "wrong password" apart from "not an admin account".
        mvc.perform(get("/api/admin/users").with(as(user)))
                .andExpect(status().isForbidden());
    }

    @Test
    void lockingAnAccountRefusesItEverywhere() throws Exception
    {
        signup(ADMIN);
        String victim = "3005550003";
        String victimId = signup(victim);

        mvc.perform(get("/api/stores").with(as(victim))).andExpect(status().isOk());

        setAccess(victimId, true, "non-payment", 200);

        // The login route and an ordinary data route both slam shut, with the code the SPA
        // shows on its login screen.
        mvc.perform(get("/api/auth/me").with(as(victim)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("ACCOUNT_DISABLED"));
        mvc.perform(get("/api/stores").with(as(victim)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("ACCOUNT_DISABLED"));
    }

    @Test
    void unlockingGivesTheAccountBack() throws Exception
    {
        signup(ADMIN);
        String victim = "3005550004";
        String victimId = signup(victim);

        setAccess(victimId, true, "mistake", 200);
        setAccess(victimId, false, "sorted out", 200);

        mvc.perform(get("/api/auth/me").with(as(victim))).andExpect(status().isOk());
    }

    @Test
    void everyChangeIsRecordedWithWhoAndWhy() throws Exception
    {
        signup(ADMIN);
        String victim = "3005550005";
        String victimId = signup(victim);

        setAccess(victimId, true, "non-payment", 200);
        setAccess(victimId, false, "paid up", 200);

        // Newest first, so the panel reads top-down as "what happened last".
        mvc.perform(get("/api/admin/users/" + victimId).with(as(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.disabled").value(false))
                .andExpect(jsonPath("$.history.length()").value(2))
                .andExpect(jsonPath("$.history[0].disabled").value(false))
                .andExpect(jsonPath("$.history[0].reason").value("paid up"))
                .andExpect(jsonPath("$.history[0].actor").value("u%s@x.com".formatted(ADMIN)))
                .andExpect(jsonPath("$.history[1].disabled").value(true))
                .andExpect(jsonPath("$.history[1].reason").value("non-payment"));
    }

    @Test
    void repeatingTheStateTheAccountIsAlreadyInRecordsNothing() throws Exception
    {
        signup(ADMIN);
        String victim = "3005550006";
        String victimId = signup(victim);

        setAccess(victimId, true, "non-payment", 200);
        setAccess(victimId, true, "non-payment", 200);

        // The history is a log of changes, not of clicks.
        assertThat(events.findByUserIdOrderByCreatedAtDesc(victimId)).hasSize(1);
    }

    @Test
    void anAdminAccountCannotBeLocked() throws Exception
    {
        String adminId = signup(ADMIN);

        // Otherwise the panel's own door can be bolted from the inside, and the way back in
        // is a database edit.
        setAccess(adminId, true, "oops", 400);

        assertThat(users.findByIdentifier(ADMIN).orElseThrow().isDisabled()).isFalse();
    }

    @Test
    void anUnknownUserIsNotFound() throws Exception
    {
        signup(ADMIN);

        setAccess("no-such-user", true, "whatever", 404);
    }
}
