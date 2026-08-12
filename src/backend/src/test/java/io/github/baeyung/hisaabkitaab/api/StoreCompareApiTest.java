package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code GET /api/stores/compare}: every shop the caller owns, each with its own dashboard over
 * one window.
 *
 * <p>Two things here are easy to get wrong and invisible until a user hits them. The path sits
 * under the same prefix as {@code /api/stores/{storeId}}, so a routing change that made the
 * variable win would turn this into a 404 on a store called "compare". And every row is built
 * from a shop id in a loop, so a scoping slip would report one shop's revenue against another's
 * name — or against a shop belonging to somebody else entirely.
 */
class StoreCompareApiTest extends ApiTest
{
    private static final String OWNER = "3109000001";
    private static final String STRANGER = "3109000002";

    @Test
    void comparesOnlyTheCallersOwnShopsAndScopesEachOnesNumbers() throws Exception
    {
        signup(OWNER);
        signup(STRANGER);

        String busy = createStore(OWNER, "Rana Cloth");
        createStore(OWNER, "Rana Fabrics");
        createStore(STRANGER, "Someone Else");

        sellFor(busy, 5, 100);

        // An array, not a single object: proof the literal path won over
        // /api/stores/{storeId}, which would have read "compare" as an id and 404'd.
        mvc.perform(get("/api/stores/compare").with(as(OWNER)))
                .andExpect(status().isOk())
                // The stranger's shop is on nobody's books but their own.
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.store.name=='Someone Else')]").doesNotExist())
                // Revenue lands on the shop that earned it, and only on that one.
                .andExpect(jsonPath("$[?(@.store.name=='Rana Cloth')].dashboard.sales").value(500.0))
                .andExpect(jsonPath("$[?(@.store.name=='Rana Fabrics')].dashboard.sales").value(0.0))
                // Each row carries the whole dashboard, which is what the screen renders from.
                .andExpect(jsonPath("$[0].dashboard.daily").isArray())
                .andExpect(jsonPath("$[0].dashboard.topItems").isArray());
    }

    @Test
    void windowNarrowsToTheDatesAsked() throws Exception
    {
        signup(OWNER);
        String store = createStore(OWNER, "Rana Cloth");
        sellFor(store, 5, 100);

        String longAgo = LocalDate.now().minusDays(30).toString();
        mvc.perform(get("/api/stores/compare")
                        .param("from", longAgo)
                        .param("to", LocalDate.now().minusDays(20).toString())
                        .with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].dashboard.sales").value(0.0));
    }

    @Test
    void requiresAuthentication() throws Exception
    {
        mvc.perform(get("/api/stores/compare")).andExpect(status().isUnauthorized());
    }

    /** Records a cash sale of {@code quantity} units at {@code rate} in the given store. */
    private void sellFor(String storeId, int quantity, int rate) throws Exception
    {
        MvcResult itemResult = mvc.perform(post(api(storeId, "/store-items")).with(as(OWNER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Lawn\",\"unit\":\"m\",\"salePrice\":100,\"costPrice\":80}"))
                .andExpect(status().isOk())
                .andReturn();
        String itemId = tree(itemResult).get("id").asText();

        mvc.perform(put(api(storeId, "/store-items/" + itemId + "/opening-stock")).with(as(OWNER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":100}"))
                .andExpect(status().isOk());

        String sale = """
                {
                  "transactionEvent":"SALE",
                  "cashAmount":%1$d,
                  "billAmount":%1$d,
                  "billDate":"%2$s",
                  "party":{"name":"Ahmad"},
                  "items":[{"itemId":"%3$s","quantity":%4$d,"itemSoldAt":%5$d}]
                }
                """.formatted(quantity * rate, LocalDate.now(), itemId, quantity, rate);

        mvc.perform(post(api(storeId, "/event")).with(as(OWNER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sale))
                .andExpect(status().isOk());
    }
}
