package io.github.baeyung.hisaabkitaab.api;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import jakarta.persistence.EntityManager;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The khata statement's three figures. A row used to carry only what the entry left on the
 * khata, which on a part-paid bill is neither the bill nor the payment — 500 of cloth against
 * 200 in cash read as "300", and nothing on the row said where it came from. The statement now
 * carries the two figures that explain it, and this pins them to the entries that produce them.
 */
class PartyStatementApiTest extends ApiTest
{
    private static final String USER = "3200000201";

    @Autowired
    private EntityManager entityManager;

    /**
     * Make the entries visible to a read the way a second HTTP request would see them —
     * see {@link PurchaseDocApiTest}, which needs this for the same reason: the whole test
     * runs in one transaction, and a transaction's {@code lines} collection is the inverse
     * side the processors never populate. Without it every goods and cash figure here reads
     * as absent, which is exactly what this test is checking is not the case.
     */
    private void settle()
    {
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    void statementRowsCarryGoodsAndCashBesideTheKhataFigure() throws Exception
    {
        signup(USER);
        String store = createStore(USER, "Rana Cloth");

        MvcResult itemResult = mvc.perform(post(api(store, "/store-items")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Lawn\",\"unit\":\"m\",\"salePrice\":100,\"costPrice\":80}"))
                .andExpect(status().isOk())
                .andReturn();
        String itemId = tree(itemResult).get("id").asText();

        MvcResult partyResult = mvc.perform(post(api(store, "/parties")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ahmad\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String partyId = tree(partyResult).get("id").asText();

        // They walked in already owing 1,000 — no goods, no cash, just a position carried over.
        mvc.perform(put(api(store, "/parties/" + partyId + "/opening-balance")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":1000,\"direction\":\"THEY_OWE_YOU\"}"))
                .andExpect(status().isOk());

        // Backdated, and a day apart, so the statement's order is fixed by business date
        // rather than by the clock: entries booked inside the same millisecond tie on
        // createdAt and fall through to a random line id. The opening balance carries
        // today's entry date — the app stamps it, not the caller — so it sorts last.
        LocalDate today = LocalDate.now();
        // Part-paid: 5 × 100 of cloth, 200 into the drawer, 300 onto the khata.
        sale(store, partyId, itemId, 5, 200, today.minusDays(3));
        // Paid in full: nothing reaches the khata, and the row used to read as a bare "0".
        sale(store, partyId, itemId, 2, 200, today.minusDays(2));

        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactionEvent":"RECEIPT",
                                  "cashAmount":150,
                                  "billDate":"%s",
                                  "party":{"partyId":"%s"}
                                }
                                """.formatted(today.minusDays(1), partyId)))
                .andExpect(status().isOk());

        settle();

        mvc.perform(get(api(store, "/ledger/" + partyId)).with(as(USER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(4))

                // The part-paid bill: all three figures, and goods − cash = khata.
                .andExpect(jsonPath("$.rows[0].event").value("SALE"))
                .andExpect(jsonPath("$.rows[0].goodsTotal").value(500.0))
                .andExpect(jsonPath("$.rows[0].cashAmount").value(200.0))
                .andExpect(jsonPath("$.rows[0].amount").value(300.0))
                .andExpect(jsonPath("$.rows[0].inOut").value("IN"))

                // Settled at the counter: the bill and the cash still show, and the khata
                // figure is the zero the column now leaves blank rather than printing.
                .andExpect(jsonPath("$.rows[1].event").value("SALE"))
                .andExpect(jsonPath("$.rows[1].goodsTotal").value(200.0))
                .andExpect(jsonPath("$.rows[1].cashAmount").value(200.0))
                .andExpect(jsonPath("$.rows[1].amount").value(0.0))

                // A receipt is not a document: the cash is the whole of it.
                .andExpect(jsonPath("$.rows[2].event").value("RECEIPT"))
                .andExpect(jsonPath("$.rows[2].goodsTotal").doesNotExist())
                .andExpect(jsonPath("$.rows[2].cashAmount").value(150.0))
                .andExpect(jsonPath("$.rows[2].amount").value(150.0))
                .andExpect(jsonPath("$.rows[2].inOut").value("OUT"))

                // Opening balance: a position, not a document — no goods, and no cash moved.
                .andExpect(jsonPath("$.rows[3].event").value("OPENING_BALANCE"))
                .andExpect(jsonPath("$.rows[3].amount").value(1000.0))
                .andExpect(jsonPath("$.rows[3].goodsTotal").doesNotExist())
                .andExpect(jsonPath("$.rows[3].cashAmount").doesNotExist())

                // 1000 + 300 − 150 still owing.
                .andExpect(jsonPath("$.currentBalance.amount").value(1150.0))
                .andExpect(jsonPath("$.currentBalance.direction").value("THEY_OWE_YOU"));
    }

    /** A purchase runs the other way: the cash leaves the drawer, so its direction is OUT. */
    @Test
    void purchaseRowReportsCashGoingOut() throws Exception
    {
        String user = "3200000202";
        signup(user);
        String store = createStore(user, "Rana Cloth");

        MvcResult itemResult = mvc.perform(post(api(store, "/store-items")).with(as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Thread\",\"unit\":\"kg\",\"salePrice\":60,\"costPrice\":40}"))
                .andExpect(status().isOk())
                .andReturn();
        String itemId = tree(itemResult).get("id").asText();

        // 10 kg at 40 = 400 of thread, 100 paid down, 300 left owing to the supplier.
        mvc.perform(post(api(store, "/event")).with(as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactionEvent":"PURCHASE",
                                  "cashAmount":100,
                                  "billAmount":400,
                                  "billDate":"%s",
                                  "party":{"name":"Bilal Traders"},
                                  "items":[{"itemId":"%s","quantity":10,"itemSoldAt":40}]
                                }
                                """.formatted(LocalDate.now(), itemId)))
                .andExpect(status().isOk());

        settle();

        MvcResult ledger = mvc.perform(get(api(store, "/ledger")).with(as(user)))
                .andExpect(status().isOk())
                .andReturn();
        String partyId = tree(ledger).get(0).get("partyId").asText();

        mvc.perform(get(api(store, "/ledger/" + partyId)).with(as(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].goodsTotal").value(400.0))
                .andExpect(jsonPath("$.rows[0].cashAmount").value(100.0))
                .andExpect(jsonPath("$.rows[0].amount").value(300.0))
                .andExpect(jsonPath("$.rows[0].inOut").value("OUT"))
                .andExpect(jsonPath("$.currentBalance.direction").value("YOU_OWE_THEM"));
    }

    private void sale(String store, String partyId, String itemId, int quantity, double cash, LocalDate date)
            throws Exception
    {
        mvc.perform(post(api(store, "/event")).with(as(USER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "transactionEvent":"SALE",
                                  "cashAmount":%s,
                                  "billAmount":%s,
                                  "billDate":"%s",
                                  "party":{"partyId":"%s"},
                                  "items":[{"itemId":"%s","quantity":%s,"itemSoldAt":100}]
                                }
                                """.formatted(cash, quantity * 100.0, date, partyId, itemId, quantity)))
                .andExpect(status().isOk());
    }
}
