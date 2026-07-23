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

/** /api/store-items: owner-scoped CRUD, opening stock, and cross-owner isolation. */
class StoreItemApiTest extends ApiTest
{
    private String createItem(String contact, String name) throws Exception
    {
        MvcResult r = mvc.perform(post("/api/store-items").with(as(contact))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"unit\":\"m\",\"salePrice\":100,\"costPrice\":80}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(r).get("id").asText();
    }

    @Test
    void listRequiresAuthentication() throws Exception
    {
        mvc.perform(get("/api/store-items")).andExpect(status().isUnauthorized());
    }

    @Test
    void createThenListGetUpdateDelete() throws Exception
    {
        signup("3103000001");
        createStore("3103000001", "Rana Cloth");
        String id = createItem("3103000001", "Lawn");

        mvc.perform(get("/api/store-items").with(as("3103000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Lawn"));

        mvc.perform(get("/api/store-items/" + id).with(as("3103000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lawn"));

        mvc.perform(put("/api/store-items/" + id).with(as("3103000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Lawn Premium\",\"salePrice\":120}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Lawn Premium"));

        mvc.perform(delete("/api/store-items/" + id).with(as("3103000001")))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/store-items/" + id).with(as("3103000001")))
                .andExpect(status().isNotFound());
    }

    @Test
    void createRejectsBlankName() throws Exception
    {
        signup("3103000002");
        createStore("3103000002", "Rana Cloth");
        mvc.perform(post("/api/store-items").with(as("3103000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void oneUserCannotSeeAnothersItem() throws Exception
    {
        signup("3103000003");
        signup("3103000004");
        createStore("3103000003", "Rana Cloth");
        createStore("3103000004", "Other Store");
        String lawn = createItem("3103000003", "Lawn");

        mvc.perform(get("/api/store-items/" + lawn).with(as("3103000004")))
                .andExpect(status().isNotFound());
    }

    @Test
    void openingStockRoundTrips() throws Exception
    {
        signup("3103000005");
        createStore("3103000005", "Rana Cloth");
        String id = createItem("3103000005", "Lawn");

        mvc.perform(put("/api/store-items/" + id + "/opening-stock").with(as("3103000005"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":25}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").value(25));

        mvc.perform(get("/api/inventory").with(as("3103000005")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].currentStock").value(25));
    }
}
