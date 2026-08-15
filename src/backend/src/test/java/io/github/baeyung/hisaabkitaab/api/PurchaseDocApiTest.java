package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import jakarta.persistence.EntityManager;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The purchases read surface: a PURCHASE driven through {@code /event} comes back from
 * {@code /transactions/purchases} the way a SALE comes back from {@code /transactions/bills}.
 *
 * The half worth guarding is that the two never bleed into each other — they share one
 * response shape and one query service, so a mixed-up event would go unnoticed everywhere
 * except here.
 */
class PurchaseDocApiTest extends ApiTest
{
    private static final String USER = "3200000101";

    @Autowired
    private EntityManager entityManager;

    /**
     * Make the entries visible to a read the way a second HTTP request would see them.
     *
     * {@link ApiTest} runs the whole test in one transaction, so writes and reads share a
     * persistence context — and a transaction's {@code lines} collection is the inverse
     * side, which the processors never populate when they save the lines themselves. Left
     * alone, every amount below reads as zero (bills included: this is not a purchase
     * quirk). Flushing and clearing forces the read to re-query, which is what production
     * does anyway, one request per transaction.
     */
    private void settle()
    {
        entityManager.flush();
        entityManager.clear();
    }

    /** An item to buy and sell, so the two documents have something in common to confuse. */
    private String createItem(String store) throws Exception
    {
        MvcResult result = mvc.perform(post(api(store, "/store-items")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Lawn\",\"unit\":\"m\",\"salePrice\":100,\"costPrice\":80}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(result).get("id").asText();
    }

    private void postEvent(String store, String body) throws Exception
    {
        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
        settle();
    }

    @Test
    void purchaseIsListedWithItsSupplierAndTotal() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");
        String itemId = createItem(store);

        // Bought 10 at 80 = 800, of which 300 paid in cash → 500 still owed to the supplier.
        postEvent(store, """
                {
                  "transactionEvent":"PURCHASE",
                  "cashAmount":300,
                  "billAmount":800,
                  "billNumber":"P-1",
                  "billDate":"%s",
                  "description":"lawn stock",
                  "party":{"name":"Bilal Traders"},
                  "items":[{"itemId":"%s","quantity":10,"itemSoldAt":80}]
                }
                """.formatted(LocalDate.now(), itemId));

        MvcResult listed = mvc.perform(get(api(store, "/transactions/purchases")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].billNumber").value("P-1"))
                .andExpect(jsonPath("$[0].partyName").value("Bilal Traders"))
                // Σ(quantity × rate) over the stock lines, not the cash paid.
                .andExpect(jsonPath("$[0].amount").value(800.0))
                .andReturn();

        String purchaseId = tree(listed).get(0).get("id").asText();

        // The detail carries the lines, the cash paid, and what is still owed.
        mvc.perform(get(api(store, "/transactions/purchases/" + purchaseId)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.goodsTotal").value(800.0))
                .andExpect(jsonPath("$.cashReceived").value(300.0))
                .andExpect(jsonPath("$.outstanding.amount").value(500.0))
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.lines[0].itemName").value("Lawn"))
                .andExpect(jsonPath("$.lines[0].quantity").value(10));

        // The batch fetch behind "print all" returns the same document.
        mvc.perform(post(api(store, "/transactions/purchases/details")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"" + purchaseId + "\"]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(purchaseId));
    }

    @Test
    void billsAndPurchasesDoNotSeeEachOther() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");
        String itemId = createItem(store);
        String today = LocalDate.now().toString();

        postEvent(store, """
                {
                  "transactionEvent":"PURCHASE",
                  "cashAmount":800,
                  "billAmount":800,
                  "billNumber":"P-1",
                  "billDate":"%s",
                  "party":{"name":"Bilal Traders"},
                  "items":[{"itemId":"%s","quantity":10,"itemSoldAt":80}]
                }
                """.formatted(today, itemId));

        postEvent(store, """
                {
                  "transactionEvent":"SALE",
                  "cashAmount":500,
                  "billAmount":500,
                  "billNumber":"B-1",
                  "billDate":"%s",
                  "party":{"name":"Ahmad"},
                  "items":[{"itemId":"%s","quantity":5,"itemSoldAt":100}]
                }
                """.formatted(today, itemId));

        // Each list holds only its own event, even though both moved the same item.
        MvcResult purchases = mvc.perform(get(api(store, "/transactions/purchases")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].billNumber").value("P-1"))
                .andReturn();

        MvcResult bills = mvc.perform(get(api(store, "/transactions/bills")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].billNumber").value("B-1"))
                .andReturn();

        String purchaseId = tree(purchases).get(0).get("id").asText();
        String billId = tree(bills).get(0).get("id").asText();

        // Asking one endpoint for the other's id is a 404, not somebody else's document.
        mvc.perform(get(api(store, "/transactions/bills/" + purchaseId)).with(as(USER)))
                .andExpect(status().isNotFound());
        mvc.perform(get(api(store, "/transactions/purchases/" + billId)).with(as(USER)))
                .andExpect(status().isNotFound());

        // Same for the batch fetch, which drops what doesn't belong instead of failing.
        mvc.perform(post(api(store, "/transactions/purchases/details")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[\"" + billId + "\"]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void purchaseCanBeFilteredBySupplierAndItem() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");
        String itemId = createItem(store);
        String today = LocalDate.now().toString();

        postEvent(store, """
                {
                  "transactionEvent":"PURCHASE",
                  "cashAmount":800,
                  "billAmount":800,
                  "billNumber":"P-1",
                  "billDate":"%s",
                  "party":{"name":"Bilal Traders"},
                  "items":[{"itemId":"%s","quantity":10,"itemSoldAt":80}]
                }
                """.formatted(today, itemId));

        MvcResult parties = mvc.perform(get(api(store, "/ledger")).with(as(USER)))
                .andExpect(status().isOk())
                .andReturn();
        String partyId = tree(parties).get(0).get("partyId").asText();

        mvc.perform(get(api(store, "/transactions/purchases?partyId=" + partyId)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        mvc.perform(get(api(store, "/transactions/purchases?itemId=" + itemId)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));

        // A filter that matches nothing empties the list rather than being ignored.
        mvc.perform(get(api(store, "/transactions/purchases?itemId=no-such-item")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
