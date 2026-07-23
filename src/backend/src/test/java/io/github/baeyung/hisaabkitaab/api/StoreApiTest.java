package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** /api/stores: owner-scoped CRUD, opening cash, and cross-owner isolation. */
class StoreApiTest extends ApiTest
{
    @Test
    void listRequiresAuthentication() throws Exception
    {
        mvc.perform(get("/api/stores")).andExpect(status().isUnauthorized());
    }

    @Test
    void createThenListGetUpdateDelete() throws Exception
    {
        signup("3101000001");
        String id = createStore("3101000001", "Rana Cloth");

        mvc.perform(get("/api/stores").with(as("3101000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Rana Cloth"));

        mvc.perform(get("/api/stores/" + id).with(as("3101000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rana Cloth"));

        mvc.perform(put("/api/stores/" + id).with(as("3101000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rana Fabrics\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rana Fabrics"));

        mvc.perform(delete("/api/stores/" + id).with(as("3101000001")))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/stores/" + id).with(as("3101000001")))
                .andExpect(status().isNotFound());
    }

    @Test
    void createRejectsBlankName() throws Exception
    {
        signup("3101000002");
        mvc.perform(post("/api/stores").with(as("3101000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oneUserCannotSeeAnothersStore() throws Exception
    {
        signup("3101000003");
        signup("3101000004");
        String ranaStore = createStore("3101000003", "Rana Cloth");

        // The other user must not be able to read it — reported as 404, never leaked.
        mvc.perform(get("/api/stores/" + ranaStore).with(as("3101000004")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/stores").with(as("3101000004")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void openingCashDefaultsToZeroThenRoundTrips() throws Exception
    {
        signup("3101000005");
        createStore("3101000005", "Rana Cloth");

        mvc.perform(get("/api/stores/opening-cash").with(as("3101000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(0.0));

        mvc.perform(put("/api/stores/opening-cash").with(as("3101000005"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":1500.0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(1500.0));

        mvc.perform(get("/api/stores/opening-cash").with(as("3101000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(1500.0));
    }

    @Test
    void openingCashRejectsNegative() throws Exception
    {
        signup("3101000006");
        createStore("3101000006", "Rana Cloth");
        mvc.perform(put("/api/stores/opening-cash").with(as("3101000006"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":-1.0}"))
                .andExpect(status().isBadRequest());
    }
}
