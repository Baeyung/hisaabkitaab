package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The khata's spend heads are listed without their entries and opened one at a time. A shop a few
 * years in has tens of thousands of expenses, and the screen that lists the heads prints a name, a
 * count and a total — so this is the test that fails if the list ever starts carrying rows again.
 */
class LedgerHeadsApiTest extends ApiTest
{
    private static final String USER = "3200000009";

    @Test
    void expenseHeadsAreListedWithoutRowsAndOpenedOneAtATime() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        expense(store, 900, "bijli");
        expense(store, 100, "chai");

        // The list: one head, counted and totalled, carrying no entries.
        mvc.perform(get(api(store, "/ledger/expense-categories")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                // The literal the roll-up query coalesces to must be this constant.
                .andExpect(jsonPath("$[0].category").value(ExpenseCategoryService.UNCATEGORIZED))
                .andExpect(jsonPath("$[0].count").value(2))
                .andExpect(jsonPath("$[0].total").value(1000.0))
                .andExpect(jsonPath("$[0].rows.length()").value(0));

        // The head itself: the same two figures, now with the entries and their running total.
        mvc.perform(get(api(store, "/ledger/expense-categories/" + ExpenseCategoryService.UNCATEGORIZED)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(2))
                .andExpect(jsonPath("$.total").value(1000.0))
                .andExpect(jsonPath("$.rows.length()").value(2))
                // The list's total is the head's last running total — the two must never drift.
                .andExpect(jsonPath("$.rows[1].runningTotal").value(1000.0));

        // The range is by business date: both entries are today's, so a window ending yesterday
        // has no heads, and the head opened on that window is empty rather than missing — the
        // screen carries the list's range along and lets the shopkeeper widen it.
        mvc.perform(get(api(store, "/ledger/expense-categories")).with(as(USER))
                        .param("to", LocalDate.now().minusDays(1).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(api(store, "/ledger/expense-categories/" + ExpenseCategoryService.UNCATEGORIZED)).with(as(USER))
                        .param("to", LocalDate.now().minusDays(1).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(0))
                .andExpect(jsonPath("$.total").value(0.0))
                .andExpect(jsonPath("$.rows.length()").value(0));

        // A head with nothing in it at all is likewise empty, not missing.
        mvc.perform(get(api(store, "/ledger/expense-categories/SALARIES")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(0));

        // Same for walk-in cash: this shop has rung up none, so neither kind has anything —
        // but a kind that isn't one is still a typed URL.
        mvc.perform(get(api(store, "/ledger/cash")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(api(store, "/ledger/cash/SALE")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(0))
                .andExpect(jsonPath("$.total").value(0.0));
        mvc.perform(get(api(store, "/ledger/cash/NOPE")).with(as(USER)))
                .andExpect(status().isNotFound());
    }

    private void expense(String store, int amount, String note) throws Exception
    {
        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactionEvent":"EXPENSE",
                                  "cashAmount":%d,
                                  "billDate":"%s",
                                  "description":"%s"
                                }
                                """.formatted(amount, LocalDate.now(), note)))
                .andExpect(status().isOk());
    }
}
