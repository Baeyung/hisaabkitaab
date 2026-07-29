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
 * Two shopkeepers, two stores, no leakage between them. The direct reads were always scoped;
 * what wasn't is the pair of ids an entry carries in its <em>body</em> — {@code party.partyId}
 * and {@code items[].itemId}. Those named a row by id with no ownership check, so an entry
 * posted in one shop could attach itself to another shop's party or item and surface in their
 * khata and stock. These tests hold that door shut from both sides: the write is refused, and
 * the read is store-scoped so nothing already written could show through either.
 */
class TenantIsolationApiTest extends ApiTest
{
    private static final String OWNER = "3300000001";
    private static final String INTRUDER = "3300000002";

    /** Creates a party in the caller's store; returns its id. */
    private String createParty(String user, String name) throws Exception
    {
        MvcResult result = mvc.perform(post("/api/parties").with(as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(result).get("id").asText();
    }

    /** Creates an item in the caller's store; returns its id. */
    private String createItem(String user, String name) throws Exception
    {
        MvcResult result = mvc.perform(post("/api/store-items").with(as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"unit\":\"m\",\"salePrice\":100,\"costPrice\":80}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(result).get("id").asText();
    }

    private String saleBody(String partyJson, String itemsJson)
    {
        return """
                {
                  "transactionEvent":"SALE",
                  "cashAmount":0,
                  "billAmount":500,
                  "billNumber":"B-9",
                  "billDate":"%s",
                  "description":"intruder entry",
                  "party":%s,
                  "items":%s
                }
                """.formatted(LocalDate.now(), partyJson, itemsJson);
    }

    @Test
    void anEntryCannotNameAnotherShopsParty() throws Exception
    {
        signup(OWNER);
        createStore(OWNER, "Rana Cloth");
        String ownersParty = createParty(OWNER, "Ahmad");

        signup(INTRUDER);
        createStore(INTRUDER, "Other Cloth");
        String intrudersItem = createItem(INTRUDER, "Silk");

        mvc.perform(post("/api/event").with(as(INTRUDER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(saleBody(
                                "{\"partyId\":\"" + ownersParty + "\"}",
                                "[{\"itemId\":\"" + intrudersItem + "\",\"quantity\":5,\"itemSoldAt\":100}]")))
                .andExpect(status().isNotFound());

        // The owner's khata is untouched: no phantom row, and a zero balance.
        mvc.perform(get("/api/ledger/" + ownersParty).with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(0))
                .andExpect(jsonPath("$.currentBalance.amount").value(0.0));
    }

    @Test
    void anEntryCannotNameAnotherShopsItem() throws Exception
    {
        signup(OWNER);
        createStore(OWNER, "Rana Cloth");
        String ownersItem = createItem(OWNER, "Lawn");

        signup(INTRUDER);
        createStore(INTRUDER, "Other Cloth");

        mvc.perform(post("/api/event").with(as(INTRUDER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(saleBody(
                                "{\"name\":\"Walk-in\"}",
                                "[{\"itemId\":\"" + ownersItem + "\",\"quantity\":5,\"itemSoldAt\":100}]")))
                .andExpect(status().isNotFound());

        // The owner's stock never moved.
        mvc.perform(get("/api/inventory/" + ownersItem).with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(0))
                .andExpect(jsonPath("$.currentStock").value(0));
    }

    @Test
    void anotherShopsPartyAndItemAreNotReadable() throws Exception
    {
        signup(OWNER);
        createStore(OWNER, "Rana Cloth");
        String ownersParty = createParty(OWNER, "Ahmad");
        String ownersItem = createItem(OWNER, "Lawn");

        signup(INTRUDER);
        createStore(INTRUDER, "Other Cloth");

        // Not-found, never forbidden — the id's existence is itself something to hide.
        mvc.perform(get("/api/parties/" + ownersParty).with(as(INTRUDER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/store-items/" + ownersItem).with(as(INTRUDER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/ledger/" + ownersParty).with(as(INTRUDER))).andExpect(status().isNotFound());
        mvc.perform(get("/api/inventory/" + ownersItem).with(as(INTRUDER))).andExpect(status().isNotFound());
    }
}
