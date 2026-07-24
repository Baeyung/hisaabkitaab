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
 * Password-reset flow. Covers: requesting a link mints a reset token; the token sets a new
 * password exactly once (then is nulled) and the old password stops working; unknown and
 * expired tokens 404; and requesting a reset for an unknown email is a silent no-op so
 * callers can't probe which emails exist.
 */
class PasswordResetApiTest extends ApiTest
{
    @Autowired
    private UserRepository users;

    private String emailFor(String contactNumber)
    {
        return "u" + contactNumber + "@x.com"; // matches ApiTest.signup()
    }

    private String resetTokenFor(String contactNumber)
    {
        return users.findByContactNumber(contactNumber).orElseThrow().getResetToken();
    }

    private void forgot(String email) throws Exception
    {
        mvc.perform(post("/api/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent());
    }

    private void resetPassword(String token, String password, int expectedStatus) throws Exception
    {
        mvc.perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    void requestMintsResetToken() throws Exception
    {
        signup("3201000001");
        forgot(emailFor("3201000001"));
        assertNotNull(resetTokenFor("3201000001"));
    }

    @Test
    void tokenSetsNewPasswordAndOldStopsWorking() throws Exception
    {
        signup("3201000002");
        forgot(emailFor("3201000002"));
        String token = resetTokenFor("3201000002");

        resetPassword(token, "newpass123", 204);

        // New password works, old one no longer does, and the token is consumed.
        mvc.perform(get("/api/auth/me").with(httpBasic("3201000002", "newpass123")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").with(httpBasic("3201000002", PASSWORD)))
                .andExpect(status().isUnauthorized());
        assertNull(resetTokenFor("3201000002"));
    }

    @Test
    void unknownTokenIs404() throws Exception
    {
        resetPassword("not-a-real-token", "whatever123", 404);
    }

    @Test
    void expiredTokenIs404() throws Exception
    {
        signup("3201000004");
        forgot(emailFor("3201000004"));

        User user = users.findByContactNumber("3201000004").orElseThrow();
        user.setResetTokenExpiry(Instant.now().minusSeconds(60));
        users.save(user);

        resetPassword(user.getResetToken(), "newpass123", 404);
    }

    @Test
    void requestForUnknownEmailIsSilentNoContent() throws Exception
    {
        // No account has this email; still 204 so callers can't probe which emails exist.
        forgot("nobody@nowhere.com");
    }
}
