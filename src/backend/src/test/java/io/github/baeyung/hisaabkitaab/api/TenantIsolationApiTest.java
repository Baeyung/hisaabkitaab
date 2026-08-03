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
 * Two shopkeepers, two stores, no leakage between them. Every store-scoped request now names
 * its store in the path, so isolation is tested from three sides: the store id in the
 * <em>path</em> must belong to the caller; the ids an entry carries in its <em>body</em>
 * ({@code party.partyId}, {@code items[].itemId}) must belong to that store; and the reads
 * are scoped so nothing already written could show through either.
 */
class TenantIsolationApiTest extends ApiTest
{
    private static final String OWNER = "3300000001";
    private static final String INTRUDER = "3300000002";

    /** Creates a party in the given store; returns its id. */
    private String createParty(String user, String storeId, String name) throws Exception
    {
        MvcResult result = mvc.perform(post(api(storeId, "/parties")).with(as(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return tree(result).get("id").asText();
    }

    /** Creates an item in the given store; returns its id. */
    private String createItem(String user, String storeId, String name) throws Exception
    {
        MvcResult result = mvc.perform(post(api(storeId, "/store-items")).with(as(user))
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
        String ownersStore = createStore(OWNER, "Rana Cloth");
        String ownersParty = createParty(OWNER, ownersStore, "Ahmad");

        signup(INTRUDER);
        String intrudersStore = createStore(INTRUDER, "Other Cloth");
        String intrudersItem = createItem(INTRUDER, intrudersStore, "Silk");

        mvc.perform(post(api(intrudersStore, "/event")).with(as(INTRUDER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(saleBody(
                                "{\"partyId\":\"" + ownersParty + "\"}",
                                "[{\"itemId\":\"" + intrudersItem + "\",\"quantity\":5,\"itemSoldAt\":100}]")))
                .andExpect(status().isNotFound());

        // The owner's khata is untouched: no phantom row, and a zero balance.
        mvc.perform(get(api(ownersStore, "/ledger/" + ownersParty)).with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(0))
                .andExpect(jsonPath("$.currentBalance.amount").value(0.0));
    }

    @Test
    void anEntryCannotNameAnotherShopsItem() throws Exception
    {
        signup(OWNER);
        String ownersStore = createStore(OWNER, "Rana Cloth");
        String ownersItem = createItem(OWNER, ownersStore, "Lawn");

        signup(INTRUDER);
        String intrudersStore = createStore(INTRUDER, "Other Cloth");

        mvc.perform(post(api(intrudersStore, "/event")).with(as(INTRUDER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(saleBody(
                                "{\"name\":\"Walk-in\"}",
                                "[{\"itemId\":\"" + ownersItem + "\",\"quantity\":5,\"itemSoldAt\":100}]")))
                .andExpect(status().isNotFound());

        // The owner's stock never moved.
        mvc.perform(get(api(ownersStore, "/inventory/" + ownersItem)).with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(0))
                .andExpect(jsonPath("$.currentStock").value(0));
    }

    @Test
    void anotherShopsPartyAndItemAreNotReadable() throws Exception
    {
        signup(OWNER);
        String ownersStore = createStore(OWNER, "Rana Cloth");
        String ownersParty = createParty(OWNER, ownersStore, "Ahmad");
        String ownersItem = createItem(OWNER, ownersStore, "Lawn");

        signup(INTRUDER);
        String intrudersStore = createStore(INTRUDER, "Other Cloth");

        // Not-found, never forbidden — the id's existence is itself something to hide.
        mvc.perform(get(api(intrudersStore, "/parties/" + ownersParty)).with(as(INTRUDER)))
                .andExpect(status().isNotFound());
        mvc.perform(get(api(intrudersStore, "/store-items/" + ownersItem)).with(as(INTRUDER)))
                .andExpect(status().isNotFound());
        mvc.perform(get(api(intrudersStore, "/ledger/" + ownersParty)).with(as(INTRUDER)))
                .andExpect(status().isNotFound());
        mvc.perform(get(api(intrudersStore, "/inventory/" + ownersItem)).with(as(INTRUDER)))
                .andExpect(status().isNotFound());
    }

    /**
     * The store id now arrives from the client, so it is the first thing that has to be
     * checked. Naming someone else's store in the path must not open their books through
     * <em>any</em> endpoint family — and it reads as not-found, so the id itself stays secret.
     */
    @Test
    void anotherOwnersStoreIdInThePathIsRefusedEverywhere() throws Exception
    {
        signup(OWNER);
        String ownersStore = createStore(OWNER, "Rana Cloth");
        createParty(OWNER, ownersStore, "Ahmad");
        createItem(OWNER, ownersStore, "Lawn");

        signup(INTRUDER);
        createStore(INTRUDER, "Other Cloth");

        for (String path : new String[] {
                "/parties", "/store-items", "/ledger", "/ledger/expense-categories", "/inventory",
                "/cashbook", "/dashboard", "/transactions/bills", "/expense-categories", "/opening-cash" })
        {
            mvc.perform(get(api(ownersStore, path)).with(as(INTRUDER)))
                    .andExpect(status().isNotFound());
        }
    }

    /** Nor may an entry be *posted* into another owner's books. */
    @Test
    void anotherOwnersStoreIdInThePathCannotBeWrittenTo() throws Exception
    {
        signup(OWNER);
        String ownersStore = createStore(OWNER, "Rana Cloth");

        signup(INTRUDER);
        createStore(INTRUDER, "Other Cloth");

        mvc.perform(post(api(ownersStore, "/event")).with(as(INTRUDER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(saleBody("{\"name\":\"Walk-in\"}", "[]")))
                .andExpect(status().isNotFound());

        mvc.perform(post(api(ownersStore, "/parties")).with(as(INTRUDER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ghost\"}"))
                .andExpect(status().isNotFound());

        // Nothing landed in the owner's books.
        mvc.perform(get(api(ownersStore, "/parties")).with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** An unknown store id is the same answer as someone else's — nothing to distinguish. */
    @Test
    void anUnknownStoreIdIs404() throws Exception
    {
        signup(OWNER);
        createStore(OWNER, "Rana Cloth");

        mvc.perform(get(api("00000000-0000-0000-0000-000000000000", "/parties")).with(as(OWNER)))
                .andExpect(status().isNotFound());
    }
}
