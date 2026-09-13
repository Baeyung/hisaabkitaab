package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A cash sale can carry a customer's name for the bill without opening a khata: the name
 * shows wherever the party's would, no party is created, and nothing reads as owed —
 * even when the cash typed in falls short of the bill.
 */
class WalkInNameApiTest extends ApiTest
{
    private static final String USER = "3200000011";

    @Test
    void namedCashSaleIsLabelledButOpensNoKhata() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        MvcResult itemResult = mvc.perform(post(api(store, "/store-items")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Lawn\",\"unit\":\"m\",\"salePrice\":100,\"costPrice\":80}"))
                .andExpect(status().isOk())
                .andReturn();
        String itemId = tree(itemResult).get("id").asText();

        String sale = """
                {
                  "transactionEvent":"SALE",
                  "cashAmount":400,
                  "billAmount":500,
                  "billNumber":"B-1",
                  "billDate":"%s",
                  "walkInName":"  Ali Traders ",
                  "items":[{"itemId":"%s","quantity":5,"itemSoldAt":100}]
                }
                """.formatted(LocalDate.now(), itemId);
        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON).content(sale))
                .andExpect(status().isOk());

        // No party was created for the name.
        mvc.perform(get(api(store, "/parties")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        // The bill list and detail are made out to the name, and nothing is owed on it.
        MvcResult bills = mvc.perform(get(api(store, "/transactions/bills")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].partyName").value("Ali Traders"))
                .andExpect(jsonPath("$[0].outstanding.direction").value("SETTLED"))
                .andReturn();
        String billId = tree(bills).get(0).get("id").asText();
        mvc.perform(get(api(store, "/transactions/bills/" + billId)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.partyId").doesNotExist())
                .andExpect(jsonPath("$.partyName").value("Ali Traders"))
                .andExpect(jsonPath("$.outstanding.direction").value("SETTLED"));

        // The cashbook row carries the name and no khata movement.
        mvc.perform(get(api(store, "/cashbook")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].partyName").value("Ali Traders"))
                .andExpect(jsonPath("$.rows[0].khata.direction").value("SETTLED"))
                .andExpect(jsonPath("$.totalKhata.direction").value("SETTLED"));

        // The cash-sales statement row carries the name too, so the ledger can search by it.
        mvc.perform(get(api(store, "/ledger/cash/SALE")).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].walkInName").value("Ali Traders"));

        // The entry reads back for edit with the name and no party.
        mvc.perform(get(api(store, "/event/" + billId)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.party").doesNotExist())
                .andExpect(jsonPath("$.walkInName").value("Ali Traders"));
    }
}
