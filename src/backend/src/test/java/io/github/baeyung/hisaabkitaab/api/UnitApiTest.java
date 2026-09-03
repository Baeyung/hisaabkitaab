package io.github.baeyung.hisaabkitaab.api;

import tools.jackson.databind.JsonNode;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * /api/stores/{storeId}/units and /unit-conversions: the Units screen's Manage Units
 * add/rename/delete, its case-insensitive duplicate refusal, and deleting a taught
 * conversion.
 */
class UnitApiTest extends ApiTest
{
    @Test
    void renameRefusesACaseInsensitiveDuplicateAndDeleteRemovesTheUnit() throws Exception
    {
        signup("3104000001");
        String store = createStore("3104000001", "Rana Cloth");

        MvcResult listed = mvc.perform(get(api(store, "/units")).with(as("3104000001")))
                .andExpect(status().isOk())
                // seeded with the default set, "Meter" and "Gaz" among them
                .andExpect(jsonPath("$[?(@.name == 'Meter')]").exists())
                .andReturn();

        String meterId = findIdByName(tree(listed), "Meter");
        String gazId = findIdByName(tree(listed), "Gaz");

        // Renaming Meter to "gaz" (different case) collides with the existing Gaz unit.
        mvc.perform(patch(api(store, "/units/" + meterId)).with(as("3104000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"gaz\"}"))
                .andExpect(status().isConflict());

        // An uncontested rename goes through.
        mvc.perform(patch(api(store, "/units/" + meterId)).with(as("3104000001"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Metre\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Metre"));

        mvc.perform(delete(api(store, "/units/" + gazId)).with(as("3104000001")))
                .andExpect(status().isNoContent());

        mvc.perform(get(api(store, "/units")).with(as("3104000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'Metre')]").exists())
                .andExpect(jsonPath("$[?(@.name == 'Gaz')]").doesNotExist());
    }

    /** The New unit token: a name the shop does not have yet is added, one it already has —
     *  in any casing — comes back as a conflict rather than a second row. */
    @Test
    void addingAUnitRefusesACaseInsensitiveDuplicate() throws Exception
    {
        signup("3104000003");
        String store = createStore("3104000003", "Rana Cloth");

        mvc.perform(post(api(store, "/units")).with(as("3104000003"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Thaan\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Thaan"));

        mvc.perform(post(api(store, "/units")).with(as("3104000003"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"thaan\"}"))
                .andExpect(status().isConflict());

        // Seeded names are held to the same rule.
        mvc.perform(post(api(store, "/units")).with(as("3104000003"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"gaz\"}"))
                .andExpect(status().isConflict());

        mvc.perform(get(api(store, "/units")).with(as("3104000003")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'Thaan')]").exists())
                .andExpect(jsonPath("$[?(@.name == 'thaan')]").doesNotExist());
    }

    @Test
    void deletingAConversionForgetsTheRate() throws Exception
    {
        signup("3104000002");
        String store = createStore("3104000002", "Rana Cloth");

        MvcResult taught = mvc.perform(put(api(store, "/unit-conversions")).with(as("3104000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fromUnit\":\"Than\",\"toUnit\":\"Metre\",\"factor\":22}"))
                .andExpect(status().isOk())
                .andReturn();
        String id = tree(taught).get("id").asText();

        mvc.perform(delete(api(store, "/unit-conversions/" + id)).with(as("3104000002")))
                .andExpect(status().isNoContent());

        mvc.perform(get(api(store, "/unit-conversions")).with(as("3104000002")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    private String findIdByName(JsonNode units, String name) throws Exception
    {
        for (JsonNode u : units)
        {
            if (u.get("name").asText().equals(name))
            {
                return u.get("id").asText();
            }
        }
        throw new AssertionError("no unit named " + name);
    }
}
