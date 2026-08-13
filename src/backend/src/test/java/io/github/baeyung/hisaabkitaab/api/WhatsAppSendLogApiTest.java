package io.github.baeyung.hisaabkitaab.api;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import io.github.baeyung.hisaabkitaab.entity.WhatsAppSend;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendStatus;
import io.github.baeyung.hisaabkitaab.repository.WhatsAppSendRepository;
import io.github.baeyung.hisaabkitaab.service.pdf.PdfRenderService;
import io.github.baeyung.hisaabkitaab.service.whatsapp.DocumentShareService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The audit trail: that a send writes down who sent what to whom, and that a message Meta
 * refused is written down as such rather than quietly missing.
 */
class WhatsAppSendLogApiTest extends ApiTest
{
    private static final String OWNER = "3492000001";

    @Autowired
    private WhatsAppSendRepository sendRepository;

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

    private String party(String storeId) throws Exception
    {
        return tree(mvc.perform(post(api(storeId, "/parties")).with(as(OWNER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Rehman\",\"contact\":\"923001234567\"}"))
                .andExpect(status().isOk())
                .andReturn()).get("id").asString();
    }

    private void send(String storeId, String partyId) throws Exception
    {
        mvc.perform(post(api(storeId, "/whatsapp")).with(as(OWNER))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"html":"<p>bill</p>","filename":"bill.pdf","action":"Bill","locale":"en",\
                        "recipients":[{"kind":"PARTY","id":"%s"}]}""".formatted(partyId)))
                .andExpect(status().isOk());
    }

    @Test
    void aSendIsWrittenDown() throws Exception
    {
        String ownerId = signup(OWNER);
        String store = createStore(OWNER, "Kiryana Store");
        String partyId = party(store);

        send(store, partyId);

        List<WhatsAppSend> log = sendRepository.findByStoreIdOrderBySentAtDesc(store);
        assertEquals(1, log.size());

        WhatsAppSend row = log.get(0);
        assertEquals(ownerId, row.getSenderId());
        assertEquals(partyId, row.getTargetId());
        assertEquals("Rehman", row.getRecipientName());
        assertEquals("923001234567", row.getContact());
        assertEquals("bill.pdf", row.getFilename());
        assertEquals(WhatsAppSendStatus.SENT, row.getStatus());
    }

    /** A message Meta would not take is still an attempt, and reads as one. */
    @Test
    void aRefusedSendIsWrittenDownAsFailed() throws Exception
    {
        signup(OWNER);
        String store = createStore(OWNER, "Kiryana Store");
        String partyId = party(store);
        when(documentShareService.share(any(), any(), any(), any(), any(), any())).thenReturn(false);

        send(store, partyId);

        assertEquals(WhatsAppSendStatus.FAILED,
                sendRepository.findByStoreIdOrderBySentAtDesc(store).get(0).getStatus());
    }
}
