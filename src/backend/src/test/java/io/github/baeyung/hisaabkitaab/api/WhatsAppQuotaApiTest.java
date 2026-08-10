package io.github.baeyung.hisaabkitaab.api;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;

import io.github.baeyung.hisaabkitaab.entity.UserPlan;
import io.github.baeyung.hisaabkitaab.enums.PlanTier;
import io.github.baeyung.hisaabkitaab.repository.UserPlanRepository;
import io.github.baeyung.hisaabkitaab.service.pdf.PdfRenderService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.PartyDocumentService;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The WhatsApp quota: that it is spent per message, refused when it runs out, charged to the
 * shop's owner rather than whoever pressed the button, and started again by the calendar.
 *
 * <p>Both ends of the send are mocked, and for different reasons. {@link PdfRenderService}
 * talks to a headless Chrome that no test has, and {@link PartyDocumentService} talks to Meta
 * — neither is what this class is about, and the second one has to be stubbed <em>true</em> on
 * purpose: a real send is suppressed in tests, and a suppressed send is refunded, which would
 * hide every miscount this class exists to catch.
 */
@TestPropertySource(properties = "app.plans.enabled=true")
class WhatsAppQuotaApiTest extends ApiTest
{
    private static final String OWNER = "3490000001";

    private static final String MEMBER = "3490000002";

    @Autowired
    private UserPlanRepository userPlanRepository;

    @MockitoBean
    private PdfRenderService pdfRenderService;

    @MockitoBean
    private PartyDocumentService partyDocumentService;

    @BeforeEach
    void stubTheOutsideWorld()
    {
        when(pdfRenderService.render(any())).thenReturn("pdf".getBytes());
        when(partyDocumentService.send(any(), any(), any(), any())).thenReturn(true);
    }

    /** Puts a plan on an account, live for a month, with the given monthly message quota. */
    private void plan(String userId, PlanTier tier, Integer whatsappQuota)
    {
        userPlanRepository.save(UserPlan.builder()
                .userId(userId)
                .tier(tier)
                .assignedAt(Instant.now())
                .expiresAt(LocalDate.now().plusMonths(1))
                .whatsappQuota(whatsappQuota)
                .build());
    }

    /** A party with a phone number, which is the only kind that can be sent to. */
    private String createParty(String actor, String storeId) throws Exception
    {
        return tree(mvc.perform(post(api(storeId, "/parties")).with(as(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Rehman\",\"contact\":\"923001234567\"}"))
                .andExpect(status().isOk())
                .andReturn()).get("id").asString();
    }

    private ResultActions sendAttempt(String actor, String storeId, String partyId) throws Exception
    {
        return mvc.perform(post(api(storeId, "/parties/" + partyId + "/whatsapp")).with(as(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"html\":\"<p>bill</p>\",\"caption\":\"Bill SALE-1\",\"filename\":\"bill.pdf\"}"));
    }

    private int used(String userId)
    {
        return userPlanRepository.findById(userId).orElseThrow().getWhatsappUsed();
    }

    @Test
    void everySendSpendsOneMessage() throws Exception
    {
        String ownerId = signup(OWNER);
        plan(ownerId, PlanTier.BASIC, 3);
        String store = createStore(OWNER, "Kiryana Store");
        String party = createParty(OWNER, store);

        sendAttempt(OWNER, store, party).andExpect(status().isAccepted());
        sendAttempt(OWNER, store, party).andExpect(status().isAccepted());

        assertEquals(2, used(ownerId));
        assertEquals(YearMonth.now().toString(),
                userPlanRepository.findById(ownerId).orElseThrow().getWhatsappPeriod());
    }

    /** The whole point: the ceiling holds at the endpoint, not merely at the button. */
    @Test
    void refusesTheSendPastTheQuota() throws Exception
    {
        String ownerId = signup(OWNER);
        plan(ownerId, PlanTier.BASIC, 2);
        String store = createStore(OWNER, "Kiryana Store");
        String party = createParty(OWNER, store);

        sendAttempt(OWNER, store, party).andExpect(status().isAccepted());
        sendAttempt(OWNER, store, party).andExpect(status().isAccepted());
        sendAttempt(OWNER, store, party).andExpect(status().isForbidden());

        // Refused, not merely reported: the count must not creep past the ceiling either.
        assertEquals(2, used(ownerId));
    }

    /** A trial carries no quota at all, which is a different refusal from having spent one. */
    @Test
    void refusesATrialOutright() throws Exception
    {
        String ownerId = signup(OWNER);
        plan(ownerId, PlanTier.TRIAL, null);
        String store = createStore(OWNER, "Kiryana Store");
        String party = createParty(OWNER, store);

        sendAttempt(OWNER, store, party).andExpect(status().isForbidden());

        assertEquals(0, used(ownerId));
    }

    /**
     * Last month's count is not this month's. Stamping an old period is what the calendar does
     * on its own, and the first send of a new month starts again from one rather than adding
     * to a total that has already lapsed.
     */
    @Test
    void startsAgainWhenTheMonthTurns() throws Exception
    {
        String ownerId = signup(OWNER);
        plan(ownerId, PlanTier.BASIC, 2);
        String store = createStore(OWNER, "Kiryana Store");
        String party = createParty(OWNER, store);

        UserPlan spent = userPlanRepository.findById(ownerId).orElseThrow();
        spent.setWhatsappUsed(2);
        spent.setWhatsappPeriod(YearMonth.now().minusMonths(1).toString());
        userPlanRepository.save(spent);

        sendAttempt(OWNER, store, party).andExpect(status().isAccepted());

        assertEquals(1, used(ownerId));
    }

    /**
     * A member works inside the owner's shop on the owner's plan, so their sends come out of
     * the owner's quota — and their own plan, which covers nothing, is not consulted.
     */
    @Test
    void chargesTheOwnerForAMembersSend() throws Exception
    {
        String ownerId = signup(OWNER);
        String memberId = signup(MEMBER);
        plan(ownerId, PlanTier.PREMIUM, 5);
        plan(memberId, PlanTier.TRIAL, null);

        String store = createStore(OWNER, "Kiryana Store");
        mvc.perform(post(api(store, "/members")).with(as(OWNER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"u%s@x.com\",\"role\":\"EDITOR\"}".formatted(MEMBER)))
                .andExpect(status().isOk());

        String party = createParty(OWNER, store);

        sendAttempt(MEMBER, store, party).andExpect(status().isAccepted());

        assertEquals(1, used(ownerId));
        assertEquals(0, used(memberId));
    }

    /**
     * A message Meta never took is not a message the account should pay for — which is the
     * normal case while no document template is approved, not an edge one.
     */
    @Test
    void givesTheMessageBackWhenItDoesNotGoOut() throws Exception
    {
        when(partyDocumentService.send(any(), any(), any(), any())).thenReturn(false);

        String ownerId = signup(OWNER);
        plan(ownerId, PlanTier.BASIC, 3);
        String store = createStore(OWNER, "Kiryana Store");
        String party = createParty(OWNER, store);

        sendAttempt(OWNER, store, party).andExpect(status().isAccepted());

        assertEquals(0, used(ownerId));
    }

    /** What the button reads to grey itself out, counted the same way the refusal is. */
    @Test
    void reportsMessagesSpentThisMonth() throws Exception
    {
        String ownerId = signup(OWNER);
        plan(ownerId, PlanTier.BASIC, 4);
        String store = createStore(OWNER, "Kiryana Store");
        String party = createParty(OWNER, store);

        sendAttempt(OWNER, store, party).andExpect(status().isAccepted());

        mvc.perform(get("/api/plan/me").with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limits.whatsappQuota").value(4))
                .andExpect(jsonPath("$.usage.whatsapp").value(1));
    }
}
