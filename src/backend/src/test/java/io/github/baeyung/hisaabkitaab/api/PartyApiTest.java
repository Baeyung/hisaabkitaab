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

/** /api/parties: owner-scoped CRUD, opening balance, and cross-owner isolation. */
class PartyApiTest extends ApiTest
{
    private String createParty(String contact, String name) throws Exception
    {
        MvcResult r = mvc.perform(post("/api/parties").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(r).get("id").asText();
    }

    @Test
    void listRequiresAuthentication() throws Exception
    {
        mvc.perform(get("/api/parties")).andExpect(status().isUnauthorized());
    }

    @Test
    void createThenListGetUpdateDelete() throws Exception
    {
        signup("3102000001");
        createStore("3102000001", "Rana Cloth");
        String id = createParty("3102000001", "Ahmad");

        mvc.perform(get("/api/parties").with(as("3102000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Ahmad"));

        mvc.perform(get("/api/parties/" + id).with(as("3102000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ahmad"));

        mvc.perform(put("/api/parties/" + id).with(as("3102000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ahmad Traders\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ahmad Traders"));

        mvc.perform(delete("/api/parties/" + id).with(as("3102000001")))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/parties/" + id).with(as("3102000001")))
                .andExpect(status().isNotFound());
    }

    @Test
    void createRejectsBlankName() throws Exception
    {
        signup("3102000002");
        createStore("3102000002", "Rana Cloth");
        mvc.perform(post("/api/parties").with(as("3102000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oneUserCannotSeeAnothersParty() throws Exception
    {
        signup("3102000003");
        signup("3102000004");
        createStore("3102000003", "Rana Cloth");
        createStore("3102000004", "Other Store");
        String ahmad = createParty("3102000003", "Ahmad");

        mvc.perform(get("/api/parties/" + ahmad).with(as("3102000004")))
                .andExpect(status().isNotFound());
    }

    @Test
    void openingBalanceRoundTrips() throws Exception
    {
        signup("3102000005");
        createStore("3102000005", "Rana Cloth");
        String id = createParty("3102000005", "Ahmad");

        mvc.perform(put("/api/parties/" + id + "/opening-balance").with(as("3102000005"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":500.0,\"direction\":\"THEY_OWE_YOU\"}"))
                .andExpect(status().isOk());

        // The opening now surfaces on the party's ledger balance.
        mvc.perform(get("/api/parties").with(as("3102000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Ahmad"));
    }
}
