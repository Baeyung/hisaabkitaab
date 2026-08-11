package io.github.baeyung.hisaabkitaab.api;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Processed goods: the batch arithmetic, and what it does to the shelf.
 *
 * <p>The first test is the worked example from {@code docs/processed_good.png} — greige cloth
 * plus three consumables making 9500 metres of chamki at 60.53 a metre. The rest cover what
 * that example does not: an output item that already had a price and stock behind it, and the
 * fact that a batch can be taken back but not edited.
 */
class ProcessingApiTest extends ApiTest
{
    private static final String USER = "3200000030";

    @Test
    void processingRequiresAuthentication() throws Exception
    {
        mvc.perform(post(api("any-store", "/processing")).contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void batchConsumesItsInputsAndPricesWhatItMade() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Processing");

        // The three consumables, each with stock to draw down.
        String green = itemWithStock(store, "Green colour", "grams", 500);
        String blue = itemWithStock(store, "Blue colour", "grams", 500);
        String coal = itemWithStock(store, "Wood/coal", "grams", 500);

        String batch = """
                {
                  "rawItems":[{"name":"KORA","unit":"meter","quantity":10000,"pricePerUnit":43}],
                  "processingItems":[
                    {"itemId":"%s","name":"Green colour","unit":"grams","quantity":100,"pricePerUnit":500},
                    {"itemId":"%s","name":"Blue colour","unit":"grams","quantity":200,"pricePerUnit":450},
                    {"itemId":"%s","name":"Wood/coal","unit":"grams","quantity":50,"pricePerUnit":100}
                  ],
                  "output":{"name":"chamki-100","unit":"meter","quantity":9500,"wastage":500},
                  "billNumber":"P-1",
                  "billDate":"%s",
                  "description":"first batch"
                }
                """.formatted(green, blue, coal, LocalDate.now());

        mvc.perform(post(api(store, "/processing")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(batch))
                .andExpect(status().isNoContent());

        JsonNode stock = tree(mvc.perform(get(api(store, "/inventory")).with(as(USER)))
                .andExpect(status().isOk()).andReturn());

        // Consumables came off the shelf; the raw material was never on it.
        assertPrice("400", byName(stock, "Green colour"), "currentStock");
        assertPrice("300", byName(stock, "Blue colour"), "currentStock");
        assertPrice("450", byName(stock, "Wood/coal"), "currentStock");
        assertNull(byName(stock, "KORA"), "a raw material must never reach the catalogue");

        // (43×10000 + 500×100 + 450×200 + 100×50) ÷ 9500 = 60.5263
        JsonNode made = byName(stock, "chamki-100");
        assertPrice("9500", made, "currentStock");
        assertPrice("60.5263", made, "costPrice");
        // Nothing to read a margin from on a brand-new item, so no sale price is invented.
        assertPrice("0", made, "salePrice");

        // The batch reads back whole — raw row included, even though it is no catalogue item.
        mvc.perform(get(api(store, "/processing")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].billNumber").value("P-1"))
                .andExpect(jsonPath("$[0].description").value("first batch"))
                .andExpect(jsonPath("$[0].rawItems.length()").value(1))
                .andExpect(jsonPath("$[0].rawItems[0].name").value("KORA"))
                .andExpect(jsonPath("$[0].processingItems.length()").value(3))
                .andExpect(jsonPath("$[0].output.name").value("chamki-100"))
                .andExpect(jsonPath("$[0].output.wastage").value(500))
                .andExpect(jsonPath("$[0].recent").value(true));
    }

    @Test
    void secondBatchAveragesCostAndKeepsTheOldMargin() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Processing");

        // 100 already on hand at cost 50, sold at 60 — a 20% margin to preserve.
        String chamki = item(store, "chamki-100", "meter", 60, 50);
        setOpeningStock(store, chamki, 100);
        String dye = itemWithStock(store, "Dye", "grams", 50);

        // 100 raw @ 60 + 10 dye @ 100 = 7000, over 100 output = 70 a unit.
        String batch = """
                {
                  "rawItems":[{"name":"KORA","unit":"meter","quantity":100,"pricePerUnit":60}],
                  "processingItems":[
                    {"itemId":"%s","name":"Dye","unit":"grams","quantity":10,"pricePerUnit":100}
                  ],
                  "output":{"itemId":"%s","name":"chamki-100","unit":"meter","quantity":100}
                }
                """.formatted(dye, chamki);

        mvc.perform(post(api(store, "/processing")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(batch))
                .andExpect(status().isNoContent());

        JsonNode made = byName(tree(mvc.perform(get(api(store, "/inventory")).with(as(USER)))
                .andExpect(status().isOk()).andReturn()), "chamki-100");

        // (100×50 + 100×70) ÷ 200 = 60, and 60 × (60÷50) holds the margin at 20%.
        assertPrice("200", made, "currentStock");
        assertPrice("60", made, "costPrice");
        assertPrice("72", made, "salePrice");
    }

    @Test
    void batchCanBeDeletedButNotEdited() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Processing");
        String dye = itemWithStock(store, "Dye", "grams", 50);

        String batch = """
                {
                  "rawItems":[{"name":"KORA","unit":"meter","quantity":100,"pricePerUnit":60}],
                  "processingItems":[
                    {"itemId":"%s","name":"Dye","unit":"grams","quantity":10,"pricePerUnit":100}
                  ],
                  "output":{"name":"chamki-100","unit":"meter","quantity":100}
                }
                """.formatted(dye);

        mvc.perform(post(api(store, "/processing")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(batch))
                .andExpect(status().isNoContent());

        MvcResult listed = mvc.perform(get(api(store, "/processing")).with(as(USER)))
                .andExpect(status().isOk()).andReturn();
        String entryId = tree(listed).get(0).get("transactionId").asText();

        // Editing one as an event would drop its raw rows and leave the output mispriced.
        mvc.perform(put(api(store, "/event/" + entryId)).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"transactionEvent\":\"PROCESSING\"}"))
                .andExpect(status().isConflict());

        // Deleting reverses both stock movements, because both are folded from its lines.
        mvc.perform(delete(api(store, "/event/" + entryId)).with(as(USER)))
                .andExpect(status().isNoContent());

        JsonNode stock = tree(mvc.perform(get(api(store, "/inventory")).with(as(USER)))
                .andExpect(status().isOk()).andReturn());
        assertPrice("50", byName(stock, "Dye"), "currentStock");
        assertPrice("0", byName(stock, "chamki-100"), "currentStock");

        mvc.perform(get(api(store, "/processing")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void aBatchNeedsSomethingToWorkOnAndSomethingToWorkWith() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Processing");

        String noProcessing = """
                {
                  "rawItems":[{"name":"KORA","unit":"meter","quantity":100,"pricePerUnit":60}],
                  "processingItems":[],
                  "output":{"name":"chamki-100","unit":"meter","quantity":100}
                }
                """;

        mvc.perform(post(api(store, "/processing")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(noProcessing))
                .andExpect(status().isBadRequest());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private String item(String store, String name, String unit, int salePrice, int costPrice) throws Exception
    {
        MvcResult result = mvc.perform(post(api(store, "/store-items")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","unit":"%s","salePrice":%d,"costPrice":%d}
                                """.formatted(name, unit, salePrice, costPrice)))
                .andExpect(status().isOk())
                .andReturn();
        return tree(result).get("id").asText();
    }

    private String itemWithStock(String store, String name, String unit, int quantity) throws Exception
    {
        String id = item(store, name, unit, 0, 0);
        setOpeningStock(store, id, quantity);
        return id;
    }

    private void setOpeningStock(String store, String itemId, int quantity) throws Exception
    {
        mvc.perform(put(api(store, "/store-items/" + itemId + "/opening-stock")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":%d}".formatted(quantity)))
                .andExpect(status().isOk());
    }

    /** The inventory row for one item, or null when the item isn't in the catalogue at all. */
    private static JsonNode byName(JsonNode rows, String name)
    {
        for (JsonNode row : rows)
        {
            if (name.equals(row.get("name").asText()))
            {
                return row;
            }
        }
        return null;
    }

    /**
     * Compared by value, not by scale: a cost stored at four decimal places serialises as
     * 60.0000, which is the same price as 60 but not the same {@link BigDecimal}.
     */
    private static void assertPrice(String expected, JsonNode row, String field)
    {
        BigDecimal actual = new BigDecimal(row.get(field).asText());
        assertEquals(0, new BigDecimal(expected).compareTo(actual),
                () -> field + " expected " + expected + " but was " + actual);
    }
}
