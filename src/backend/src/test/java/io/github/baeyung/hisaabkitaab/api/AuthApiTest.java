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
    void signupStoresEmailLowerCased() throws Exception
    {
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"Rana","contactNumber":"3001111111","email":"RaNa@X.CoM","password":"secret123"}
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("rana@x.com"));
    }

    @Test
    void loginAcceptsEmailInAnyCase() throws Exception
    {
        signup("3002222222"); // stored as u3002222222@x.com
        mvc.perform(get("/api/auth/me")
                        .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
                                .httpBasic("U3002222222@X.CoM", PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contactNumber").value("3002222222"));
    }

    @Test
    void signupRejectsEmailAlreadyRegisteredInAnotherCase() throws Exception
    {
        signup("3003333333"); // takes u3003333333@x.com
        signupExpect("""
                {"name":"Rana","contactNumber":"3004444444","email":"U3003333333@X.CoM","password":"secret123"}
                """, status().isConflict());
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
