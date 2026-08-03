package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** /api/stores/&#123;storeId&#125;/parties: store-scoped CRUD, opening balance, and cross-store isolation. */
class PartyApiTest extends ApiTest
{
    private String createParty(String contact, String storeId, String name) throws Exception
    {
        MvcResult r = mvc.perform(post(api(storeId, "/parties")).with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(r).get("id").asString();
    }

    @Test
    void listRequiresAuthentication() throws Exception
    {
        mvc.perform(get(api("any-store", "/parties"))).andExpect(status().isUnauthorized());
    }

    @Test
    void createThenListGetUpdateDelete() throws Exception
    {
        signup("3102000001");
        String store = createStore("3102000001", "Rana Cloth");
        String id = createParty("3102000001", store, "Ahmad");

        mvc.perform(get(api(store, "/parties")).with(as("3102000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Ahmad"));

        mvc.perform(get(api(store, "/parties/" + id)).with(as("3102000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ahmad"));

        mvc.perform(put(api(store, "/parties/" + id)).with(as("3102000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ahmad Traders\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ahmad Traders"));

        mvc.perform(delete(api(store, "/parties/" + id)).with(as("3102000001")))
                .andExpect(status().isNoContent());

        mvc.perform(get(api(store, "/parties/" + id)).with(as("3102000001")))
                .andExpect(status().isNotFound());
    }

    @Test
    void createRejectsBlankName() throws Exception
    {
        signup("3102000002");
        String store = createStore("3102000002", "Rana Cloth");
        mvc.perform(post(api(store, "/parties")).with(as("3102000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oneUserCannotSeeAnothersParty() throws Exception
    {
        signup("3102000003");
        signup("3102000004");
        String rana = createStore("3102000003", "Rana Cloth");
        String other = createStore("3102000004", "Other Store");
        String ahmad = createParty("3102000003", rana, "Ahmad");

        mvc.perform(get(api(other, "/parties/" + ahmad)).with(as("3102000004")))
                .andExpect(status().isNotFound());
    }

    @Test
    void openingBalanceRoundTrips() throws Exception
    {
        signup("3102000005");
        String store = createStore("3102000005", "Rana Cloth");
        String id = createParty("3102000005", store, "Ahmad");

        mvc.perform(put(api(store, "/parties/" + id + "/opening-balance")).with(as("3102000005"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":500.0,\"direction\":\"THEY_OWE_YOU\"}"))
                .andExpect(status().isOk());

        // The opening now surfaces on the party's ledger balance.
        mvc.perform(get(api(store, "/parties")).with(as("3102000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Ahmad"));
    }

    /** One owner, two shops: a khata opened in one is absent from the other. */
    @Test
    void partiesAreScopedToTheStoreInThePath() throws Exception
    {
        signup("3102000006");
        String cloth = createStore("3102000006", "Rana Cloth");
        String hardware = createStore("3102000006", "Rana Hardware");
        createParty("3102000006", cloth, "Ahmad");

        mvc.perform(get(api(cloth, "/parties")).with(as("3102000006")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        mvc.perform(get(api(hardware, "/parties")).with(as("3102000006")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
