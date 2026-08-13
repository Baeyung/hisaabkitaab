package io.github.baeyung.hisaabkitaab.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The back office's half of the opt-out: seeing who has blocked a shop, and being the only
 * thing anywhere that can undo it.
 */
@TestPropertySource(properties = {
        "app.plans.enabled=true",
        // signup() derives the email from the contact number, so this names ADMIN's account.
        "app.admin.emails=u3400000910@x.com"
})
class AdminWhatsAppBlockApiTest extends ApiTest
{
    private static final String ADMIN = "3400000910";

    private static final String SHOPKEEPER = "3400000911";

    /** A shop with one party, who has since opted out. Returns the party's block token. */
    private String aBlockedParty() throws Exception
    {
        signup(ADMIN);
        signup(SHOPKEEPER);
        String store = createStore(SHOPKEEPER, "Kiryana Store");

        String party = tree(mvc.perform(post(api(store, "/parties")).with(as(SHOPKEEPER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Rehman\",\"contact\":\"923001234567\"}"))
                .andExpect(status().isOk())
                .andReturn()).get("id").asString();

        mvc.perform(post("/api/block/" + store + ":" + party)).andExpect(status().isOk());
        return store + ":" + party;
    }

    @Test
    void listsWhoHasOptedOutAndPutsThemBack() throws Exception
    {
        String token = aBlockedParty();

        String blockId = tree(mvc.perform(get("/api/admin/whatsapp-blocks").with(as(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].storeName").value("Kiryana Store"))
                .andExpect(jsonPath("$[0].recipientName").value("Rehman"))
                // The whole number, unlike the public page: support is on the phone to them.
                .andExpect(jsonPath("$[0].contact").value("923001234567"))
                .andReturn()).get(0).get("id").asString();

        mvc.perform(delete("/api/admin/whatsapp-blocks/" + blockId).with(as(ADMIN)))
                .andExpect(status().isNoContent());

        // Put back on, and the opt-out page says so — it is the same question again.
        mvc.perform(get("/api/block/" + token)).andExpect(jsonPath("$.blocked").value(false));
        mvc.perform(get("/api/admin/whatsapp-blocks").with(as(ADMIN)))
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Not the shopkeeper's to undo, however much they would like the customer back. */
    @Test
    void theShopkeeperCannotUnblockTheirOwnCustomer() throws Exception
    {
        aBlockedParty();

        mvc.perform(get("/api/admin/whatsapp-blocks").with(as(SHOPKEEPER)))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/whatsapp-blocks/anything").with(as(SHOPKEEPER)))
                .andExpect(status().isForbidden());
    }
}
