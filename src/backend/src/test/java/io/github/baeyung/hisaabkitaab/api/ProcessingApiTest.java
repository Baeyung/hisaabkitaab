package io.github.baeyung.hisaabkitaab.api;

import java.math.BigDecimal;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

        // Consumables came off the shelf; so did the raw material, which nothing bought in —
        // the shop is saying it already had cloth the books never saw it buy.
        assertPrice("400", byName(stock, "Green colour"), "currentStock");
        assertPrice("300", byName(stock, "Blue colour"), "currentStock");
        assertPrice("450", byName(stock, "Wood/coal"), "currentStock");
        assertPrice("-10000", byName(stock, "KORA"), "currentStock");

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

    /**
     * A row bought in for the batch is a purchase and nothing cleverer: it books the ordinary
     * PURCHASE entry, so the goods land on the shelf, what was paid leaves the drawer and the
     * rest sits on the supplier's khata. The batch then consumes what it just bought, which is
     * why the shelf ends where it started — and this is the test that catches either half of
     * that pair going missing.
     */
    @Test
    void aRowBoughtInForTheBatchIsPurchasedThenConsumed() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Processing");
        String dye = itemWithStock(store, "Dye", "grams", 50);

        MvcResult created = mvc.perform(post(api(store, "/parties")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rana Textiles\"}"))
                .andExpect(status().isOk()).andReturn();
        String party = tree(created).get("id").asString();

        // 100 metres of cloth at 60 = 6000, of which 2000 was handed over.
        String batch = """
                {
                  "rawItems":[{
                    "name":"KORA","unit":"meter","quantity":100,"pricePerUnit":60,
                    "party":{"partyId":"%s","name":"Rana Textiles"},"paid":2000
                  }],
                  "processingItems":[
                    {"itemId":"%s","name":"Dye","unit":"grams","quantity":10,"pricePerUnit":100}
                  ],
                  "output":{"name":"chamki-100","unit":"meter","quantity":100},
                  "billDate":"%s"
                }
                """.formatted(party, dye, LocalDate.now());

        mvc.perform(post(api(store, "/processing")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(batch))
                .andExpect(status().isNoContent());

        // Bought in and used up in the same breath: the shelf is exactly where it started.
        JsonNode stock = tree(mvc.perform(get(api(store, "/inventory")).with(as(USER)))
                .andExpect(status().isOk()).andReturn());
        assertPrice("0", byName(stock, "KORA"), "currentStock");
        assertPrice("40", byName(stock, "Dye"), "currentStock");
        assertPrice("100", byName(stock, "chamki-100"), "currentStock");

        // 4000 still owing, on an ordinary purchase row — not a special processing one.
        mvc.perform(get(api(store, "/ledger/" + party)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].event").value("PURCHASE"))
                .andExpect(jsonPath("$.rows[0].amount").value(4000.0))
                .andExpect(jsonPath("$.currentBalance.amount").value(4000.0))
                .andExpect(jsonPath("$.currentBalance.direction").value("YOU_OWE_THEM"));

        // …and the 2000 that was paid left the drawer.
        mvc.perform(get(api(store, "/cashbook")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalOut").value(2000.0));

        // The batch reads back with the supplier on the row it was bought for.
        MvcResult listed = mvc.perform(get(api(store, "/processing")).with(as(USER)))
                .andExpect(status().isOk()).andReturn();
        String entryId = tree(listed).get(0).get("transactionId").asString();

        mvc.perform(get(api(store, "/processing/" + entryId)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.partyId").doesNotExist())
                .andExpect(jsonPath("$.output.name").value("chamki-100"))
                .andExpect(jsonPath("$.rawItems.length()").value(1))
                .andExpect(jsonPath("$.rawItems[0].name").value("KORA"))
                .andExpect(jsonPath("$.rawItems[0].partyName").value("Rana Textiles"))
                .andExpect(jsonPath("$.processingItems.length()").value(1))
                .andExpect(jsonPath("$.processingItems[0].name").value("Dye"))
                .andExpect(jsonPath("$.processingItems[0].partyName").doesNotExist());
    }

    /**
     * Buy 100 metres of cloth in, dye it, and call what comes out by the same name — one item
     * that goes up, comes down and goes up again, ending on 100. The cost has to be the batch's
     * own 70, not an average against the 100 it just bought and is about to consume: those are
     * the same metres, counted once, and a purchase leaves no cost price behind to average with.
     */
    @Test
    void buyingInTheItemTheBatchMakesLeavesOneLotAtTheBatchsCost() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Processing");

        MvcResult created = mvc.perform(post(api(store, "/parties")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rana Textiles\"}"))
                .andExpect(status().isOk()).andReturn();
        String party = tree(created).get("id").asString();

        // 100 KORA @ 60 bought in, plus 10 dye @ 100, making 100 KORA: (6000 + 1000) ÷ 100 = 70.
        String batch = """
                {
                  "rawItems":[{
                    "name":"KORA","unit":"meter","quantity":100,"pricePerUnit":60,
                    "party":{"partyId":"%s","name":"Rana Textiles"},"paid":6000
                  }],
                  "processingItems":[
                    {"name":"Dye","unit":"grams","quantity":10,"pricePerUnit":100}
                  ],
                  "output":{"name":"KORA","unit":"meter","quantity":100}
                }
                """.formatted(party);

        mvc.perform(post(api(store, "/processing")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(batch))
                .andExpect(status().isNoContent());

        // +100 bought, −100 consumed, +100 made.
        JsonNode kora = byName(tree(mvc.perform(get(api(store, "/inventory")).with(as(USER)))
                .andExpect(status().isOk()).andReturn()), "KORA");
        assertPrice("100", kora, "currentStock");
        assertPrice("70", kora, "costPrice");
    }

    /**
     * One supplier named on two rows settles as one purchase, because that is how the shopkeeper
     * settles with them — two rows in their khata for one delivery would be two things to chase.
     */
    @Test
    void oneSupplierAcrossTwoRowsBooksOnePurchase() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Processing");

        MvcResult created = mvc.perform(post(api(store, "/parties")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rana Textiles\"}"))
                .andExpect(status().isOk()).andReturn();
        String party = tree(created).get("id").asString();

        // 100×60 on the raw row plus 10×100 on the dye = 7000, nothing paid.
        String batch = """
                {
                  "rawItems":[{
                    "name":"KORA","unit":"meter","quantity":100,"pricePerUnit":60,
                    "party":{"partyId":"%s","name":"Rana Textiles"}
                  }],
                  "processingItems":[{
                    "name":"Dye","unit":"grams","quantity":10,"pricePerUnit":100,
                    "party":{"partyId":"%s","name":"Rana Textiles"}
                  }],
                  "output":{"name":"chamki-100","unit":"meter","quantity":100}
                }
                """.formatted(party, party);

        mvc.perform(post(api(store, "/processing")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(batch))
                .andExpect(status().isNoContent());

        mvc.perform(get(api(store, "/ledger/" + party)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].amount").value(7000.0))
                .andExpect(jsonPath("$.currentBalance.amount").value(7000.0));

        // Nothing was paid, so the drawer never opened.
        mvc.perform(get(api(store, "/cashbook")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalOut").value(0.0));
    }

    /**
     * A consumable row can be work rather than goods — the dyeing charge, not the dye. It costs
     * the batch and it bills the supplier like any other row; what it does not do is keep a
     * shelf quantity, which is the item's {@code service} flag and nothing more.
     */
    @Test
    void aServiceRowCostsTheBatchAndBillsItsSupplierButKeepsNoStock() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Processing");
        String kora = itemWithStock(store, "KORA", "meter", 100);

        MvcResult created = mvc.perform(post(api(store, "/parties")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Rangsaz\"}"))
                .andExpect(status().isOk()).andReturn();
        String party = tree(created).get("id").asString();

        // 100 metres off the shelf at 60, plus a 3000 dyeing charge on credit: 9000 ÷ 100 = 90.
        String batch = """
                {
                  "rawItems":[
                    {"itemId":"%s","name":"KORA","unit":"meter","quantity":100,"pricePerUnit":60}
                  ],
                  "processingItems":[{
                    "name":"Dyeing charges","unit":"job","quantity":1,"pricePerUnit":3000,
                    "service":true,"party":{"partyId":"%s","name":"Rangsaz"}
                  }],
                  "output":{"name":"chamki-100","unit":"meter","quantity":100}
                }
                """.formatted(kora, party);

        mvc.perform(post(api(store, "/processing")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(batch))
                .andExpect(status().isNoContent());

        // The charge carries no on-hand quantity; the cloth and the output still do.
        JsonNode stock = tree(mvc.perform(get(api(store, "/inventory")).with(as(USER)))
                .andExpect(status().isOk()).andReturn());
        assertEquals(true, byName(stock, "Dyeing charges").get("service").asBoolean());
        assertEquals(true, byName(stock, "Dyeing charges").get("currentStock").isNull());
        assertPrice("0", byName(stock, "KORA"), "currentStock");
        assertPrice("100", byName(stock, "chamki-100"), "currentStock");
        assertPrice("90", byName(stock, "chamki-100"), "costPrice");

        // …and the 3000 sits on the dyer's khata, unpaid, as an ordinary purchase.
        mvc.perform(get(api(store, "/ledger/" + party)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].event").value("PURCHASE"))
                .andExpect(jsonPath("$.currentBalance.amount").value(3000.0));
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
