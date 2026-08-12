package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /api/users/me — the account editing itself. Whoever they are in a shop, they get exactly
 * one account here: their own.
 */
class ProfileApiTest extends ApiTest
{
    private static String body(String name, String contactNumber)
    {
        return "{\"name\":\"%s\",\"contactNumber\":\"%s\"}".formatted(name, contactNumber);
    }

    @Test
    void updatesOwnNameAndNumberAndKeepsTheEmail() throws Exception
    {
        signup("3310000001");

        mvc.perform(put("/api/users/me").with(as("3310000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Ahmad Raza", "3319999999")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ahmad Raza"))
                .andExpect(jsonPath("$.contactNumber").value("3319999999"))
                // Not in the request and not movable by it: it is the verified address.
                .andExpect(jsonPath("$.email").value("u3310000001@x.com"));

        // The number is also a login identifier, so the new one has to authenticate.
        mvc.perform(get("/api/auth/me").with(as("3319999999")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ahmad Raza"));
    }

    @Test
    void refusesANumberAnotherAccountAlreadyHas() throws Exception
    {
        signup("3310000002");
        signup("3310000003");

        mvc.perform(put("/api/users/me").with(as("3310000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Taken", "3310000003")))
                .andExpect(status().isConflict());
    }

    @Test
    void rejectsANumberThatIsNotDigits() throws Exception
    {
        signup("3310000004");

        mvc.perform(put("/api/users/me").with(as("3310000004"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Bad", "0300-123")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void refusesAnAnonymousCaller() throws Exception
    {
        mvc.perform(put("/api/users/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Nobody", "3310000005")))
                .andExpect(status().isUnauthorized());
    }
}
