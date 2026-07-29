package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;

import io.github.baeyung.hisaabkitaab.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Four <em>distinct</em> wrong passwords lock the account; only a password reset opens it again.
 * Distinct is the point: the same wrong password repeated is one stale device retrying, not a
 * guessing attack, and must never lock a real user out.
 */
class LoginLockoutApiTest extends ApiTest
{
    private static final int MAX_ATTEMPTS = 4;

    @Autowired
    private UserRepository users;

    /** One login attempt with the given wrong password. */
    private void failLogin(String contactNumber, String wrongPassword) throws Exception
    {
        mvc.perform(get("/api/auth/me")
                        .with(SecurityMockMvcRequestPostProcessors.httpBasic(contactNumber, wrongPassword)))
                .andExpect(status().isUnauthorized());
    }

    /** Drives the account to exactly the lock threshold, guessing a different password each time. */
    private void lockOut(String contactNumber) throws Exception
    {
        for (int i = 0; i < MAX_ATTEMPTS; i++)
        {
            failLogin(contactNumber, "guess-" + i);
        }
    }

    @Test
    void wrongPasswordIncrementsTheCounter() throws Exception
    {
        String contactNumber = "3001110001";
        signup(contactNumber);

        failLogin(contactNumber, "guess-0");

        assertThat(users.findByIdentifier(contactNumber).orElseThrow().getFailedLoginAttempts())
                .isEqualTo(1);
    }

    @Test
    void attemptsBelowTheCapStillAllowTheRightPassword() throws Exception
    {
        String contactNumber = "3001110002";
        signup(contactNumber);

        for (int i = 0; i < MAX_ATTEMPTS - 1; i++)
        {
            failLogin(contactNumber, "guess-" + i);
        }

        mvc.perform(get("/api/auth/me").with(as(contactNumber)))
                .andExpect(status().isOk());
    }

    @Test
    void successfulLoginClearsTheCounter() throws Exception
    {
        String contactNumber = "3001110003";
        signup(contactNumber);

        failLogin(contactNumber, "guess-0");
        mvc.perform(get("/api/auth/me").with(as(contactNumber))).andExpect(status().isOk());

        assertThat(users.findByIdentifier(contactNumber).orElseThrow().getFailedLoginAttempts())
                .isZero();
    }

    @Test
    void fourWrongPasswordsLockTheAccount() throws Exception
    {
        String contactNumber = "3001110004";
        signup(contactNumber);

        lockOut(contactNumber);

        // Even the *right* password is refused now, and with a code the SPA can act on.
        mvc.perform(get("/api/auth/me").with(as(contactNumber)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("ACCOUNT_LOCKED"));
    }

    @Test
    void wrongPasswordBeforeTheCapIsNotReportedAsLocked() throws Exception
    {
        String contactNumber = "3001110005";
        signup(contactNumber);

        mvc.perform(get("/api/auth/me")
                        .with(SecurityMockMvcRequestPostProcessors.httpBasic(contactNumber, "wrong-password")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Unauthorized"));
    }

    @Test
    void theSameWrongPasswordRepeatedCountsOnce() throws Exception
    {
        String contactNumber = "3001110006";
        signup(contactNumber);

        // A device whose stored credentials went stale fires a burst of identical failures on one
        // page load. That is one user with one wrong password, not six guesses — it must not lock.
        for (int i = 0; i < MAX_ATTEMPTS + 2; i++)
        {
            mvc.perform(get("/api/stores")
                            .with(SecurityMockMvcRequestPostProcessors.httpBasic(contactNumber, "stale-password")))
                    .andExpect(status().isUnauthorized());
        }

        assertThat(users.findByIdentifier(contactNumber).orElseThrow().getFailedLoginAttempts())
                .isEqualTo(1);
        mvc.perform(get("/api/auth/me").with(as(contactNumber))).andExpect(status().isOk());
    }

    @Test
    void guessingAgainstANonLoginEndpointStillLocks() throws Exception
    {
        String contactNumber = "3001110008";
        signup(contactNumber);

        // Basic auth accepts credentials everywhere, so the lockout has to apply everywhere —
        // otherwise the whole guard is walked around by guessing at any other route.
        for (int i = 0; i < MAX_ATTEMPTS; i++)
        {
            mvc.perform(get("/api/stores")
                            .with(SecurityMockMvcRequestPostProcessors.httpBasic(contactNumber, "guess-" + i)))
                    .andExpect(status().isUnauthorized());
        }

        mvc.perform(get("/api/auth/me").with(as(contactNumber)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("ACCOUNT_LOCKED"));
    }

    @Test
    void passwordResetUnlocksTheAccount() throws Exception
    {
        String contactNumber = "3001110007";
        signup(contactNumber);
        lockOut(contactNumber);

        mvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"u%s@x.com\"}".formatted(contactNumber)))
                .andExpect(status().isNoContent());

        String otp = users.findByIdentifier(contactNumber).orElseThrow().getResetToken();
        mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"u%s@x.com\",\"otp\":\"%s\",\"password\":\"brand-new-pw\"}"
                                .formatted(contactNumber, otp)))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/auth/me")
                        .with(SecurityMockMvcRequestPostProcessors.httpBasic(contactNumber, "brand-new-pw")))
                .andExpect(status().isOk());
    }

    @Test
    void unknownIdentifierIsHarmless() throws Exception
    {
        mvc.perform(get("/api/auth/me")
                        .with(SecurityMockMvcRequestPostProcessors.httpBasic("3009999999", "whatever")))
                .andExpect(status().isUnauthorized());
    }
}
