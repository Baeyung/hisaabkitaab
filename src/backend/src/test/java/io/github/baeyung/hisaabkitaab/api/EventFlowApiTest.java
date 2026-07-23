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
 * End-to-end regression net: drives a real SALE through {@code /api/event} and asserts
 * it ripples out to every read surface — bills, inventory, ledger, cashbook, dashboard.
 * This is the test that fails first if the event → transaction-line wiring ever breaks.
 */
class EventFlowApiTest extends ApiTest
{
    private static final String USER = "3200000001";

    @Test
    void eventRequiresAuthentication() throws Exception
    {
        mvc.perform(post("/api/event").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"transactionEvent\":\"SALE\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void saleRipplesToEveryReadSurface() throws Exception
    {
        signup(USER);
        createStore(USER, "Rana Cloth");

        // An item with 25 in opening stock.
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

        // A credit sale: 5 units, bill 500, only 200 paid in cash → party owes 300.
        String today = LocalDate.now().toString();
        String sale = """
                {
                  "transactionEvent":"SALE",
                  "cashAmount":200,
                  "billAmount":500,
                  "billNumber":"B-1",
                  "billDate":"%s",
                  "description":"sold lawn",
                  "party":{"name":"Ahmad"},
                  "items":[{"itemId":"%s","quantity":5,"itemSoldAt":100}]
                }
                """.formatted(today, itemId);

        mvc.perform(post("/api/event").with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(sale))
                .andExpect(status().isOk());

        // Bills: the sale is listed under its number and the auto-created party.
        mvc.perform(get("/api/transactions/bills").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].billNumber").value("B-1"))
                .andExpect(jsonPath("$[0].partyName").value("Ahmad"));

        // Inventory: 25 opening − 5 sold = 20 on hand.
        mvc.perform(get("/api/inventory").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].currentStock").value(20));

        // Ledger: the party now carries a balance.
        mvc.perform(get("/api/ledger").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name=='Ahmad')]").exists());

        // Cashbook (defaults to today): the 200 cash-in shows up.
        mvc.perform(get("/api/cashbook").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalIn").value(200.0));

        // Dashboard renders for the window without error.
        mvc.perform(get("/api/dashboard").with(as(USER)))
                .andExpect(status().isOk());

        // Expense categories were seeded for the new store.
        mvc.perform(get("/api/expense-categories").with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)));
    }

    @Test
    void eventWithUnknownTransactionEventIsRejected() throws Exception
    {
        signup("3200000002");
        createStore("3200000002", "Rana Cloth");
        mvc.perform(post("/api/event").with(as("3200000002"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"transactionEvent\":\"NOPE\"}"))
                .andExpect(status().isBadRequest());
    }
}
