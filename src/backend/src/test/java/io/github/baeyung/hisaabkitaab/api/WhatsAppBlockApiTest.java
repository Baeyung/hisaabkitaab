package io.github.baeyung.hisaabkitaab.api;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import io.github.baeyung.hisaabkitaab.entity.UserPlan;
import io.github.baeyung.hisaabkitaab.enums.PlanTier;
import io.github.baeyung.hisaabkitaab.repository.UserPlanRepository;
import io.github.baeyung.hisaabkitaab.service.pdf.PdfRenderService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.DocumentShareService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The way out of a shop's WhatsApp messages: the public page the message links to, and what a
 * confirmed block then does to the send.
 */
@TestPropertySource(properties = "app.plans.enabled=true")
class WhatsAppBlockApiTest extends ApiTest
{
    private static final String OWNER = "3491000001";

    @Autowired
    private UserPlanRepository userPlanRepository;

    @MockitoBean
    private PdfRenderService pdfRenderService;

    @MockitoBean
    private DocumentShareService documentShareService;

    @BeforeEach
    void stubTheOutsideWorld()
    {
        when(pdfRenderService.render(any())).thenReturn("pdf".getBytes());
        when(documentShareService.share(any(), any(), any(), any(), any(), any())).thenReturn(true);
    }

    private String party(String storeId, String contact) throws Exception
    {
        return tree(mvc.perform(post(api(storeId, "/parties")).with(as(OWNER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Rehman\",\"contact\":\"%s\"}".formatted(contact)))
                .andExpect(status().isOk())
                .andReturn()).get("id").asString();
    }

    /** The owner's id, kept so the quota can be read back off their plan. */
    private String ownerId;

    private String shop() throws Exception
    {
        ownerId = signup(OWNER);
        userPlanRepository.save(UserPlan.builder()
                .userId(ownerId)
                .tier(PlanTier.PREMIUM)
                .assignedAt(Instant.now())
                .expiresAt(LocalDate.now().plusMonths(1))
                .whatsappQuota(10)
                .build());
        return createStore(OWNER, "Kiryana Store");
    }

    private void send(String storeId, String partyId) throws Exception
    {
        mvc.perform(post(api(storeId, "/whatsapp")).with(as(OWNER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"html":"<p>bill</p>","filename":"bill.pdf","action":"Bill","locale":"en",\
                        "recipients":[{"kind":"PARTY","id":"%s"}]}""".formatted(partyId)))
                .andExpect(status().isOk())
                // The one send this shop is asked about here reached the party, or it did not.
                .andExpect(jsonPath("$.sent").value(0))
                .andExpect(jsonPath("$.failed[0]").value("Rehman"));
    }

    /** Signed out, since whoever follows the link out of a WhatsApp message has no account. */
    @Test
    void showsWhoIsAboutToBeBlockedWithoutSigningIn() throws Exception
    {
        String store = shop();
        String party = party(store, "923001234567");

        mvc.perform(get("/api/block/" + store + ":" + party))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.storeName").value("Kiryana Store"))
                .andExpect(jsonPath("$.recipientName").value("Rehman"))
                // The last four digits and no more — the link is all it takes to reach this.
                .andExpect(jsonPath("$.contactLast4").value("4567"))
                .andExpect(jsonPath("$.blocked").value(false));
    }

    @Test
    void confirmingStopsTheSendWithoutSpendingAMessage() throws Exception
    {
        String store = shop();
        String party = party(store, "923001234567");

        mvc.perform(post("/api/block/" + store + ":" + party))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocked").value(true));

        send(store, party);

        // Nothing left for Meta, and nothing came off the quota for a message never sent.
        assertEquals(0, userPlanRepository.findById(ownerId).orElseThrow().getWhatsappUsed());

        // …and the picker says so before the button is pressed.
        mvc.perform(get(api(store, "/whatsapp/recipients")).with(as(OWNER)).param("partyId", party))
                .andExpect(jsonPath("$.partyBlocked").value(true));
    }

    /** Idempotent: the link is in a message that can be opened as many times as they like. */
    @Test
    void blockingTwiceIsTheSameAnswer() throws Exception
    {
        String store = shop();
        String party = party(store, "923001234567");

        mvc.perform(post("/api/block/" + store + ":" + party)).andExpect(status().isOk());
        mvc.perform(post("/api/block/" + store + ":" + party))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blocked").value(true));

        mvc.perform(get("/api/block/" + store + ":" + party))
                .andExpect(jsonPath("$.blocked").value(true));
    }

    /**
     * The point of keying a block on the number: a shop that reaches the same person on a new
     * phone may message it, and the old number stays blocked underneath for when it comes back.
     */
    @Test
    void aNewNumberIsReachableAndTheOldOneStaysBlocked() throws Exception
    {
        String store = shop();
        String party = party(store, "923001234567");
        mvc.perform(post("/api/block/" + store + ":" + party)).andExpect(status().isOk());

        mvc.perform(put(api(store, "/parties/" + party)).with(as(OWNER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Rehman\",\"contact\":\"923009999999\"}"))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/whatsapp/recipients")).with(as(OWNER)).param("partyId", party))
                .andExpect(jsonPath("$.partyBlocked").value(false));

        mvc.perform(put(api(store, "/parties/" + party)).with(as(OWNER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Rehman\",\"contact\":\"923001234567\"}"))
                .andExpect(status().isOk());

        mvc.perform(get(api(store, "/whatsapp/recipients")).with(as(OWNER)).param("partyId", party))
                .andExpect(jsonPath("$.partyBlocked").value(true));
    }

    /**
     * A token naming somebody in another shop is not a lookup service. Same answer as a mangled
     * one, so this cannot be used to ask whether an id is real.
     */
    @Test
    void aTokenFromAnotherShopIsNotValid() throws Exception
    {
        String store = shop();
        String party = party(store, "923001234567");
        String other = createStore(OWNER, "Cloth House");

        mvc.perform(get("/api/block/" + other + ":" + party)).andExpect(status().isNotFound());
        mvc.perform(get("/api/block/" + store)).andExpect(status().isNotFound());
        mvc.perform(post("/api/block/" + other + ":" + party)).andExpect(status().isNotFound());
    }
}
