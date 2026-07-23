package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** /api/auth: public signup + validation, and the authenticated /me identity echo. */
class AuthApiTest extends ApiTest
{
    private void signupExpect(String body, org.springframework.test.web.servlet.ResultMatcher matcher) throws Exception
    {
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(matcher);
    }

    @Test
    void signupCreatesUserAndHidesPasswordHash() throws Exception
    {
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"Rana","contactNumber":"3001234567","email":"rana@x.com","password":"secret123"}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.name").value("Rana"))
                .andExpect(jsonPath("$.contactNumber").value("3001234567"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void signupRejectsBlankName() throws Exception
    {
        signupExpect("""
                {"name":"","contactNumber":"3001234567","password":"secret123"}
                """, status().isBadRequest());
    }

    @Test
    void signupRejectsNonDigitContactNumber() throws Exception
    {
        signupExpect("""
                {"name":"Rana","contactNumber":"030-abc","password":"secret123"}
                """, status().isBadRequest());
    }

    @Test
    void signupRejectsMissingPassword() throws Exception
    {
        signupExpect("""
                {"name":"Rana","contactNumber":"3001234567"}
                """, status().isBadRequest());
    }

    @Test
    void meRequiresAuthentication() throws Exception
    {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void meReturnsAuthenticatedUser() throws Exception
    {
        signup("3009999999");
        mvc.perform(get("/api/auth/me").with(as("3009999999")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contactNumber").value("3009999999"));
    }

    @Test
    void wrongPasswordIsRejected() throws Exception
    {
        signup("3008888888");
        mvc.perform(get("/api/auth/me")
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .httpBasic("3008888888", "wrong")))
                .andExpect(status().isUnauthorized());
    }
}
