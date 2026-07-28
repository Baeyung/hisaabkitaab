package io.github.baeyung.hisaabkitaab.api;

import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Password-reset flow. Covers: requesting a reset mints a 6-digit code; the code can be
 * checked without being consumed; it sets a new password exactly once (then is nulled) and
 * the old password stops working; wrong, expired and over-guessed codes 404; and requesting
 * a reset for an unknown email is a silent no-op so callers can't probe which emails exist.
 */
class PasswordResetApiTest extends ApiTest
{
    @Autowired
    private UserRepository users;

    private String emailFor(String contactNumber)
    {
        return "u" + contactNumber + "@x.com"; // matches ApiTest.signup()
    }

    private String otpFor(String contactNumber)
    {
        return users.findByContactNumber(contactNumber).orElseThrow().getResetToken();
    }

    /** Any 6-digit code that isn't the live one. */
    private static String wrongCode(String otp)
    {
        return "000000".equals(otp) ? "111111" : "000000";
    }

    private void forgot(String email) throws Exception
    {
        mvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent());
    }

    private void verifyOtp(String email, String otp, int expectedStatus) throws Exception
    {
        mvc.perform(post("/api/auth/verify-reset-otp")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"otp\":\"" + otp + "\"}"))
                .andExpect(status().is(expectedStatus));
    }

    private void resetPassword(String email, String otp, String password, int expectedStatus) throws Exception
    {
        mvc.perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"otp\":\"" + otp
                                + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    void requestMintsResetCode() throws Exception
    {
        signup("3201000001");
        forgot(emailFor("3201000001"));
        assertNotNull(otpFor("3201000001"));
    }

    @Test
    void codeSetsNewPasswordAndOldStopsWorking() throws Exception
    {
        signup("3201000002");
        String email = emailFor("3201000002");
        forgot(email);
        String otp = otpFor("3201000002");

        // Checking the code must not consume it — the new-password screen comes after.
        verifyOtp(email, otp, 204);
        resetPassword(email, otp, "newpass123", 204);

        // New password works, old one no longer does, and the code is consumed.
        mvc.perform(get("/api/auth/me").with(httpBasic("3201000002", "newpass123")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").with(httpBasic("3201000002", PASSWORD)))
                .andExpect(status().isUnauthorized());
        assertNull(otpFor("3201000002"));
    }

    @Test
    void wrongCodeIs404AndLeavesPasswordAlone() throws Exception
    {
        signup("3201000003");
        String email = emailFor("3201000003");
        forgot(email);
        String wrong = wrongCode(otpFor("3201000003"));

        verifyOtp(email, wrong, 404);
        resetPassword(email, wrong, "whatever123", 404);

        mvc.perform(get("/api/auth/me").with(httpBasic("3201000003", PASSWORD)))
                .andExpect(status().isOk());
    }

    @Test
    void expiredCodeIs404() throws Exception
    {
        signup("3201000004");
        forgot(emailFor("3201000004"));

        User user = users.findByContactNumber("3201000004").orElseThrow();
        String otp = user.getResetToken();
        user.setResetTokenExpiry(Instant.now().minusSeconds(60));
        users.save(user);

        resetPassword(emailFor("3201000004"), otp, "newpass123", 404);
    }

    @Test
    void codeIsBurnedAfterTooManyWrongGuesses() throws Exception
    {
        signup("3201000005");
        String email = emailFor("3201000005");
        forgot(email);
        String otp = otpFor("3201000005");

        for (int i = 0; i < 5; i++)
        {
            verifyOtp(email, wrongCode(otp), 404);
        }

        // The correct code is dead too now — the only way on is a fresh one.
        resetPassword(email, otp, "newpass123", 404);
        assertNull(otpFor("3201000005"));
    }

    @Test
    void requestForUnknownEmailIsSilentNoContent() throws Exception
    {
        // No account has this email; still 204 so callers can't probe which emails exist.
        forgot("nobody@nowhere.com");
    }
}
