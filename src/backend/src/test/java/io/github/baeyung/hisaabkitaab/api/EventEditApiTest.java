package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Edit/delete of an existing entry. Because every balance is folded from the entry's
 * lines at read time, correcting an entry means re-deriving those lines — this test
 * proves the round-trip: a wrong entry reads back for prefill, an edit moves the
 * derived balances, and a delete undoes the entry entirely.
 */
class EventEditApiTest extends ApiTest
{
    private static final String USER = "3200000010";

    @Test
    void editAndDeleteRederiveEveryBalance() throws Exception
    {
        signup(USER);
        createStore(USER, "Rana Cloth");

        MvcResult itemResult = mvc.perform(post("/api/store-items").with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Lawn\",\"unit\":\"m\",\"salePrice\":100,\"costPrice\":80}"))
                .andExpect(status().isOk())
                .andReturn();
        String itemId = tree(itemResult).get("id").asText();
        mvc.perform(put("/api/store-items/" + itemId + "/opening-stock").with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":25}"))
                .andExpect(status().isOk());

        // A credit sale: 5 units, bill 500, only 200 paid → party owes 300, drawer +200.
        String today = LocalDate.now().toString();
        String sale = """
                {
                  "transactionEvent":"SALE",
                  "cashAmount":200,
                  "billAmount":500,
                  "billNumber":"B-1",
                  "billDate":"%s",
                  "party":{"name":"Ahmad"},
                  "items":[{"itemId":"%s","quantity":5,"itemSoldAt":100}]
                }
                """.formatted(today, itemId);
        mvc.perform(post("/api/event").with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(sale))
                .andExpect(status().isOk());

        String entryId = tree(mvc.perform(get("/api/cashbook").with(as(USER)))
                .andExpect(status().isOk()).andReturn())
                .get("rows").get(0).get("transactionId").asText();

        // Reverse-map: the entry reads back as the form request that produced it.
        mvc.perform(get("/api/event/" + entryId).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transactionEvent").value("SALE"))
                .andExpect(jsonPath("$.cashAmount").value(200.0))
                .andExpect(jsonPath("$.billAmount").value(500.0))
                .andExpect(jsonPath("$.billNumber").value("B-1"))
                .andExpect(jsonPath("$.party.name").value("Ahmad"))
                .andExpect(jsonPath("$.items[0].quantity").value(5))
                .andExpect(jsonPath("$.items[0].itemSoldAt").value(100.0));

        // Correct it: same goods, but fully paid now (cash 500). Balances must move.
        String corrected = """
                {
                  "transactionEvent":"SALE",
                  "cashAmount":500,
                  "billAmount":500,
                  "billNumber":"B-1",
                  "billDate":"%s",
                  "party":{"name":"Ahmad"},
                  "items":[{"itemId":"%s","quantity":5,"itemSoldAt":100}]
                }
                """.formatted(today, itemId);
        mvc.perform(put("/api/event/" + entryId).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(corrected))
                .andExpect(status().isNoContent());

        // Drawer now reflects the corrected 500 in, and stock is still 5 out (unchanged).
        mvc.perform(get("/api/cashbook").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalIn").value(500.0))
                .andExpect(jsonPath("$.rows.length()").value(1));
        mvc.perform(get("/api/inventory").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].currentStock").value(20));

        // Delete undoes the entry: no bills, drawer empty, stock back to opening.
        mvc.perform(delete("/api/event/" + entryId).with(as(USER)))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/transactions/bills").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/cashbook").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalIn").value(0.0));
        mvc.perform(get("/api/inventory").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].currentStock").value(25));
    }

    @Test
    void editingAnotherOwnersEntryIs404() throws Exception
    {
        signup(USER + "1");
        createStore(USER + "1", "Rana Cloth");
        mvc.perform(get("/api/event/does-not-exist").with(as(USER + "1")))
                .andExpect(status().isNotFound());
    }
}
