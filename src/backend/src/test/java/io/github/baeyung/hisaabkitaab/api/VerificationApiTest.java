package io.github.baeyung.hisaabkitaab.api;

import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The verification gate, exercised with {@code app.verification.enabled=true} (the other
 * API tests run with it off). Covers: an authenticated-but-unverified user is 403'd off
 * protected endpoints, entering the emailed code opens the gate, wrong/expired codes are
 * refused, the code is burned after too many wrong guesses, and resend issues a new code
 * without verifying the account.
 */
@TestPropertySource(properties = "app.verification.enabled=true")
class VerificationApiTest extends ApiTest
{
    @Autowired
    private UserRepository users;

    private User userOf(String contactNumber)
    {
        return users.findByContactNumber(contactNumber).orElseThrow();
    }

    private String codeFor(String contactNumber)
    {
        return userOf(contactNumber).getVerificationToken();
    }

    /** POSTs a verification attempt without asserting the outcome. */
    private org.springframework.test.web.servlet.ResultActions verify(String identifier, String otp) throws Exception
    {
        return mvc.perform(post("/api/auth/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"identifier\":\"%s\",\"otp\":\"%s\"}".formatted(identifier, otp)));
    }

    /** A code that is guaranteed not to be the account's real one. */
    private static String wrongCodeFor(String actual)
    {
        return actual.equals("000000") ? "111111" : "000000";
    }

    @Test
    void unverifiedUserIsForbiddenFromProtectedEndpoints() throws Exception
    {
        signup("3101000001");
        mvc.perform(get("/api/auth/me").with(as("3101000001")))
                .andExpect(status().isForbidden());
    }

    @Test
    void enteringTheEmailedCodeOpensTheGate() throws Exception
    {
        signup("3101000002");

        verify("3101000002", codeFor("3101000002")).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").with(as("3101000002"))).andExpect(status().isOk());
    }

    @Test
    void theCodeIsSixDigitsAndClearedOnceUsed() throws Exception
    {
        signup("3101000003");
        String code = codeFor("3101000003");
        assertEquals(6, code.length());

        verify("3101000003", code).andExpect(status().isNoContent());

        User after = userOf("3101000003");
        assertNull(after.getVerificationToken());
        assertNull(after.getVerificationTokenExpiry());
    }

    @Test
    void emailAlsoWorksAsTheIdentifier() throws Exception
    {
        signup("3101000004");

        verify("u3101000004@x.com", codeFor("3101000004")).andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").with(as("3101000004"))).andExpect(status().isOk());
    }

    @Test
    void wrongCodeIs404AndLeavesTheAccountUnverified() throws Exception
    {
        signup("3101000005");
        String code = codeFor("3101000005");

        verify("3101000005", wrongCodeFor(code)).andExpect(status().isNotFound());

        User after = userOf("3101000005");
        assertFalse(after.isVerified());
        assertEquals(1, after.getVerificationAttempts());
        // The real code still works — one typo doesn't cost the user their code.
        verify("3101000005", code).andExpect(status().isNoContent());
    }

    @Test
    void codeIsBurnedAfterFiveWrongGuesses() throws Exception
    {
        signup("3101000006");
        String code = codeFor("3101000006");
        String wrong = wrongCodeFor(code);

        for (int i = 0; i < 5; i++)
        {
            verify("3101000006", wrong).andExpect(status().isNotFound());
        }

        assertNull(userOf("3101000006").getVerificationToken());
        // Even the correct code is dead now; only a resend gets the user back in.
        verify("3101000006", code).andExpect(status().isNotFound());
    }

    @Test
    void expiredCodeIsRefused() throws Exception
    {
        signup("3101000007");
        User user = userOf("3101000007");
        user.setVerificationTokenExpiry(Instant.now().minusSeconds(1));
        users.saveAndFlush(user);

        verify("3101000007", user.getVerificationToken()).andExpect(status().isNotFound());
        assertFalse(userOf("3101000007").isVerified());
    }

    @Test
    void unknownIdentifierIs404() throws Exception
    {
        verify("9999999999", "123456").andExpect(status().isNotFound());
    }

    @Test
    void nonNumericCodeIsRejectedAsABadRequest() throws Exception
    {
        signup("3101000008");
        verify("3101000008", "abcdef").andExpect(status().isBadRequest());
    }

    @Test
    void resendIssuesANewCodeAndClearsAttempts() throws Exception
    {
        signup("3101000009");
        String before = codeFor("3101000009");
        verify("3101000009", wrongCodeFor(before)).andExpect(status().isNotFound());

        mvc.perform(post("/api/auth/resend-verification")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"3101000009\"}"))
                .andExpect(status().isNoContent());

        User after = userOf("3101000009");
        assertNotEquals(before, after.getVerificationToken());
        assertEquals(0, after.getVerificationAttempts());
        assertFalse(after.isVerified());
    }

    @Test
    void wrongPasswordIs401NotLeakingVerificationState() throws Exception
    {
        signup("3101000010");
        mvc.perform(get("/api/auth/me").with(
                        org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .httpBasic("3101000010", "wrong")))
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
