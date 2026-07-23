package io.github.baeyung.hisaabkitaab.api;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Base for full-stack API tests: boots the whole Spring context (controllers →
 * services → repositories) against an in-memory H2 in PostgreSQL mode, and drives it
 * through the real HTTP Basic security filter chain via {@link MockMvc}. Each test runs
 * in its own transaction that rolls back, so tests don't leak state into one another.
 *
 * <p>Auth mirrors production: sign a user up through {@code /api/auth/signup}, then send
 * their contact number + password as Basic credentials on every subsequent request via
 * {@link #as(String)}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
abstract class ApiTest
{
    protected static final String PASSWORD = "secret123";

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    /** Signs up a user with the given contact number, returns the created user's id. */
    protected String signup(String contactNumber) throws Exception
    {
        String body = """
                {"name":"User %1$s","contactNumber":"%1$s","email":"u%1$s@x.com","password":"%2$s"}
                """.formatted(contactNumber, PASSWORD);

        MvcResult result = mvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn();

        return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    /** Basic-auth as the given contact number (the signup password is assumed). */
    protected RequestPostProcessor as(String contactNumber)
    {
        return SecurityMockMvcRequestPostProcessors.httpBasic(contactNumber, PASSWORD);
    }

    /** Creates a store owned by the given (already signed-up) user; returns its id. */
    protected String createStore(String contactNumber, String name) throws Exception
    {
        MvcResult result = mvc.perform(post("/api/stores").with(as(contactNumber))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(result).get("id").asText();
    }

    protected JsonNode tree(MvcResult result) throws Exception
    {
        return json.readTree(result.getResponse().getContentAsString());
    }
}
