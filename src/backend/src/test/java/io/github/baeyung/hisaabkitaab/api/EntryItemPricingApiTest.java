package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * What a sale or a purchase does to the catalogue: the unit an item is born in, and the price
 * list it carries afterwards. All of it used to be one hardcoded answer — every item first
 * named on an entry was created in "gz" at zero prices, and no purchase ever moved a cost.
 */
class EntryItemPricingApiTest extends ApiTest
{
    private static final String USER = "3200000021";

    private String purchase(String name, String unit, double qty, double rate)
    {
        return """
                {
                  "transactionEvent":"PURCHASE",
                  "cashAmount":%s,
                  "billAmount":%s,
                  "party":{"name":"Mill"},
                  "items":[{"name":"%s","unit":"%s","quantity":%s,"itemSoldAt":%s}]
                }
                """.formatted(qty * rate, qty * rate, name, unit, qty, rate);
    }

    /** The same bill against an item the entry screen already matched — which is what it sends
     *  for every name the catalogue holds, and the only way an existing item is ever repriced. */
    private String purchaseOf(String itemId, double qty, double rate)
    {
        return """
                {
                  "transactionEvent":"PURCHASE",
                  "cashAmount":%s,
                  "billAmount":%s,
                  "party":{"name":"Mill"},
                  "items":[{"itemId":"%s","name":"Kora","quantity":%s,"itemSoldAt":%s}]
                }
                """.formatted(qty * rate, qty * rate, itemId, qty, rate);
    }

    private String onlyItemId(String store) throws Exception
    {
        return tree(mvc.perform(get(api(store, "/store-items")).with(as(USER))).andReturn())
                .get(0).get("id").asText();
    }

    /** The unit typed on the line is the unit the item is stocked in — not a guess. */
    @Test
    void anItemFirstNamedOnAPurchaseKeepsTheUnitAndRateItWasBoughtAt() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(purchase("Kora", "Than", 10, 500)))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/store-items")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Kora"))
                .andExpect(jsonPath("$[0].unit").value("Than"))
                .andExpect(jsonPath("$[0].costPrice").value(500.0));
    }

    /**
     * 10 @ 500 then 10 @ 700 is 600 on the shelf, not 700 — the second lot weighs against the
     * first rather than erasing it. Sale price is untouched: this shop has not asked for it.
     */
    @Test
    void asecondPurchaseAveragesTheCostOverWhatWasAlreadyOnTheShelf() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(purchase("Kora", "Than", 10, 500)))
                .andExpect(status().isOk());
        // The second bill carries the id, the way the entry screen sends it once the
        // catalogue holds the name.
        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(purchaseOf(onlyItemId(store), 10, 700)))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/store-items")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].costPrice").value(600.0))
                .andExpect(jsonPath("$[0].salePrice").value(0.0));
    }

    /** Two lots of the same new name on one bill are two lots — the second weighs against the
     *  first, and only one catalogue row comes out of it. */
    @Test
    void twoLinesOfTheSameNewItemOnOneBillAverageAgainstEachOther() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        String bill = """
                {
                  "transactionEvent":"PURCHASE",
                  "cashAmount":12000,
                  "billAmount":12000,
                  "party":{"name":"Mill"},
                  "items":[
                    {"name":"Kora","unit":"Than","quantity":10,"itemSoldAt":500},
                    {"name":"Kora","unit":"Than","quantity":10,"itemSoldAt":700}
                  ]
                }
                """;

        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(bill))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/store-items")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].costPrice").value(600.0));

        mvc.perform(get(api(store, "/inventory")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].currentStock").value(20));
    }

    /** With the shop's switch on, the selling rate rides along at the margin it already had:
     *  cost 500 → 600 is +20%, so a 750 sale price becomes 900. */
    @Test
    void aPurchaseCarriesTheSalePriceAlongOnlyWhereTheShopAskedForIt() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        mvc.perform(post(api(store, "/store-items")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Kora\",\"unit\":\"Than\",\"salePrice\":750,\"costPrice\":500}"))
                .andExpect(status().isOk());
        mvc.perform(put(api(store, "/settings")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purchaseUpdatesSalePrice\":true}"))
                .andExpect(status().isOk());

        // 10 on the shelf at 500 (opening stock), then 10 more at 700.
        String itemId = onlyItemId(store);
        mvc.perform(put(api(store, "/store-items/" + itemId + "/opening-stock")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":10}"))
                .andExpect(status().isOk());

        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(purchaseOf(itemId, 10, 700)))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/store-items")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].costPrice").value(600.0))
                .andExpect(jsonPath("$[0].salePrice").value(900.0));
    }

    /**
     * A sale prices what it names for the first time and nothing else: the rate becomes the
     * selling price of a brand-new item, and an item the catalogue already holds is left alone
     * — that rate is one customer's bargain, not a new price list.
     */
    @Test
    void aSalePricesOnlyTheItemItInvents() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        String sale = """
                {
                  "transactionEvent":"SALE",
                  "cashAmount":1200,
                  "billAmount":1200,
                  "party":{"name":"Ahmad"},
                  "items":[{"name":"Latha","unit":"Gaz","quantity":10,"itemSoldAt":120}]
                }
                """;
        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sale))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/store-items")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].unit").value("Gaz"))
                .andExpect(jsonPath("$[0].salePrice").value(120.0))
                .andExpect(jsonPath("$[0].costPrice").value(0.0));

        // The same name again, now by id: a discounted second bill must not rewrite the list.
        String itemId = onlyItemId(store);
        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactionEvent":"SALE",
                                  "cashAmount":900,
                                  "billAmount":900,
                                  "party":{"name":"Ahmad"},
                                  "items":[{"itemId":"%s","name":"Latha","quantity":10,"itemSoldAt":90}]
                                }
                                """.formatted(itemId)))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/store-items")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].salePrice").value(120.0));
    }

    /** With the unit box switched off no line carries a unit, so the shop's marked default
     *  stands in — where before every such item was created in "gz". */
    @Test
    void anEntryWithNoUnitFallsBackToTheStoresDefaultUnit() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        // The seeded list holds "Gaz"; mark it default by its id.
        String gazId = null;
        for (var unit : tree(mvc.perform(get(api(store, "/units")).with(as(USER))).andReturn()))
        {
            if ("Gaz".equals(unit.get("name").asText()))
            {
                gazId = unit.get("id").asText();
            }
        }

        mvc.perform(put(api(store, "/units/" + gazId + "/default")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultUnit").value(true));

        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactionEvent":"PURCHASE",
                                  "cashAmount":5000,
                                  "billAmount":5000,
                                  "party":{"name":"Mill"},
                                  "items":[{"name":"Kora","quantity":10,"itemSoldAt":500}]
                                }
                                """))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/store-items")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].unit").value("Gaz"));
    }
}
