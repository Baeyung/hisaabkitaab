package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
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
        String store = createStore("3101000005", "Rana Cloth");

        mvc.perform(get(api(store, "/opening-cash")).with(as("3101000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(0.0));

        mvc.perform(put(api(store, "/opening-cash")).with(as("3101000005"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":1500.0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(1500.0));

        mvc.perform(get(api(store, "/opening-cash")).with(as("3101000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(1500.0));
    }

    @Test
    void openingCashRejectsNegative() throws Exception
    {
        signup("3101000006");
        String store = createStore("3101000006", "Rana Cloth");
        mvc.perform(put(api(store, "/opening-cash")).with(as("3101000006"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":-1.0}"))
                .andExpect(status().isBadRequest());
    }

    /** Many shops under one login: each is created, listed and read on its own id. */
    @Test
    void oneOwnerCanHoldSeveralStores() throws Exception
    {
        signup("3101000007");
        String cloth = createStore("3101000007", "Rana Cloth");
        String hardware = createStore("3101000007", "Rana Hardware");

        mvc.perform(get("/api/stores").with(as("3101000007")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mvc.perform(get("/api/stores/" + cloth).with(as("3101000007")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rana Cloth"));

        mvc.perform(get("/api/stores/" + hardware).with(as("3101000007")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rana Hardware"));
    }

    /** Each store carries its own drawer: setting one leaves the other at zero. */
    @Test
    void openingCashIsPerStore() throws Exception
    {
        signup("3101000008");
        String cloth = createStore("3101000008", "Rana Cloth");
        String hardware = createStore("3101000008", "Rana Hardware");

        mvc.perform(put(api(cloth, "/opening-cash")).with(as("3101000008"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":1500.0}"))
                .andExpect(status().isOk());

        mvc.perform(get(api(hardware, "/opening-cash")).with(as("3101000008")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(0.0));
    }
}
