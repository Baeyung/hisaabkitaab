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

/** /api/stores/&#123;storeId&#125;/store-items: store-scoped CRUD, opening stock, and cross-store isolation. */
class StoreItemApiTest extends ApiTest
{
    private String createItem(String contact, String storeId, String name) throws Exception
    {
        MvcResult r = mvc.perform(post(api(storeId, "/store-items")).with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"unit\":\"m\",\"salePrice\":100,\"costPrice\":80}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(r).get("id").asText();
    }

    @Test
    void listRequiresAuthentication() throws Exception
    {
        mvc.perform(get(api("any-store", "/store-items"))).andExpect(status().isUnauthorized());
    }

    @Test
    void createThenListGetUpdateDelete() throws Exception
    {
        signup("3103000001");
        String store = createStore("3103000001", "Rana Cloth");
        String id = createItem("3103000001", store, "Lawn");

        mvc.perform(get(api(store, "/store-items")).with(as("3103000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Lawn"));

        mvc.perform(get(api(store, "/store-items/" + id)).with(as("3103000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lawn"));

        mvc.perform(put(api(store, "/store-items/" + id)).with(as("3103000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Lawn Premium\",\"salePrice\":120}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lawn Premium"));

        mvc.perform(delete(api(store, "/store-items/" + id)).with(as("3103000001")))
                .andExpect(status().isNoContent());

        mvc.perform(get(api(store, "/store-items/" + id)).with(as("3103000001")))
                .andExpect(status().isNotFound());
    }

    @Test
    void createRejectsBlankName() throws Exception
    {
        signup("3103000002");
        String store = createStore("3103000002", "Rana Cloth");
        mvc.perform(post(api(store, "/store-items")).with(as("3103000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oneUserCannotSeeAnothersItem() throws Exception
    {
        signup("3103000003");
        signup("3103000004");
        String rana = createStore("3103000003", "Rana Cloth");
        String other = createStore("3103000004", "Other Store");
        String lawn = createItem("3103000003", rana, "Lawn");

        // Asked for under their own store, the id is simply not in those books.
        mvc.perform(get(api(other, "/store-items/" + lawn)).with(as("3103000004")))
                .andExpect(status().isNotFound());
    }

    @Test
    void openingStockRoundTrips() throws Exception
    {
        signup("3103000005");
        String store = createStore("3103000005", "Rana Cloth");
        String id = createItem("3103000005", store, "Lawn");

        mvc.perform(put(api(store, "/store-items/" + id + "/opening-stock")).with(as("3103000005"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":25}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(25));

        mvc.perform(get(api(store, "/inventory")).with(as("3103000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].currentStock").value(25));
    }

    /** One owner, two shops: each keeps its own catalogue. */
    @Test
    void itemsAreScopedToTheStoreInThePath() throws Exception
    {
        signup("3103000006");
        String cloth = createStore("3103000006", "Rana Cloth");
        String hardware = createStore("3103000006", "Rana Hardware");
        createItem("3103000006", cloth, "Lawn");

        mvc.perform(get(api(cloth, "/store-items")).with(as("3103000006")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        mvc.perform(get(api(hardware, "/store-items")).with(as("3103000006")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
