package io.github.baeyung.hisaabkitaab.api;

import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The verification gate, exercised with {@code app.verification.enabled=true} (the other
 * API tests run with it off). Covers: an authenticated-but-unverified user is 403'd off
 * protected endpoints, verifying the emailed token opens the gate, an unknown token 404s,
 * and resend rotates the token without verifying the account.
 */
@TestPropertySource(properties = "app.verification.enabled=true")
class VerificationApiTest extends ApiTest
{
    @Autowired
    private UserRepository users;

    private String tokenFor(String contactNumber)
    {
        return users.findByContactNumber(contactNumber).orElseThrow().getVerificationToken();
    }

    @Test
    void unverifiedUserIsForbiddenFromProtectedEndpoints() throws Exception
    {
        signup("3101000001");
        mvc.perform(get("/api/auth/me").with(as("3101000001")))
                .andExpect(status().isForbidden());
    }

    @Test
    void verifyingTheEmailedTokenOpensTheGate() throws Exception
    {
        signup("3101000002");
        String token = tokenFor("3101000002");

        mvc.perform(post("/api/auth/verify/" + token)).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").with(as("3101000002"))).andExpect(status().isOk());
    }

    @Test
    void unknownTokenIs404() throws Exception
    {
        mvc.perform(post("/api/auth/verify/not-a-real-token")).andExpect(status().isNotFound());
    }

    @Test
    void resendRotatesTokenWithoutVerifying() throws Exception
    {
        signup("3101000003");
        String before = tokenFor("3101000003");

        mvc.perform(post("/api/auth/resend-verification")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"3101000003\"}"))
                .andExpect(status().isNoContent());

        User after = users.findByContactNumber("3101000003").orElseThrow();
        assertNotEquals(before, after.getVerificationToken());
        assertFalse(after.isVerified());
    }

    @Test
    void wrongPasswordIs401NotLeakingVerificationState() throws Exception
    {
        signup("3101000004");
        mvc.perform(get("/api/auth/me").with(
                        org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .httpBasic("3101000004", "wrong")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void resendForUnknownIdentifierStillNoContent() throws Exception
    {
        // Silent no-op so callers can't probe which identifiers exist.
        mvc.perform(post("/api/auth/resend-verification")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"9999999999\"}"))
                .andExpect(status().isNoContent());
    }
}
