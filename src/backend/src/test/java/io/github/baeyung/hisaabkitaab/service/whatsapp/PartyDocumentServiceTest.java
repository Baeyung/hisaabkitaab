package io.github.baeyung.hisaabkitaab.service.whatsapp;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import io.github.baeyung.hisaabkitaab.entity.Party;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Which of the two sends a party's document takes, and the one case that must not send at
 * all. The template name is blank until Meta approves ours, and that blank is what routes
 * the PDF down the free-form path — so it is worth a test that says so.
 */
class PartyDocumentServiceTest
{
    private static final byte[] PDF = "%PDF-1.4".getBytes();

    private final WhatsAppService whatsapp = mock(WhatsAppService.class);
    private final PartyDocumentService service = new PartyDocumentService(whatsapp);

    private Party party(String contact)
    {
        Party party = new Party();
        party.setName("Rehman Cloth House");
        party.setContact(contact);
        return party;
    }

    private void template(String name, String language)
    {
        ReflectionTestUtils.setField(service, "templateName", name);
        ReflectionTestUtils.setField(service, "templateLanguage", language);
    }

    @Test
    void sendsFreeFormDocumentWhileNoTemplateIsApproved()
    {
        template("", "en_US");

        service.send(party("923001234567"), PDF, "bill-1042.pdf", "Bill 1042");

        verify(whatsapp).sendDocument("923001234567", PDF, "bill-1042.pdf", "Bill 1042");
        verify(whatsapp, never()).sendTemplateWithDocument(any(), any(), any(), any(), any(), any());
    }

    @Test
    void sendsTheApprovedTemplateOnceOneIsConfigured()
    {
        template("invoice_v1", "ur");

        service.send(party("923001234567"), PDF, "bill-1042.pdf", "Bill 1042");

        verify(whatsapp).sendTemplateWithDocument(
                "923001234567", "invoice_v1", "ur", PDF, "bill-1042.pdf", "Bill 1042");
        verify(whatsapp, never()).sendDocument(any(), any(), any(), any());
    }

    @Test
    void refusesAPartyWithNoPhoneNumber()
    {
        template("", "en_US");

        assertThatThrownBy(() -> service.send(party(null), PDF, "bill.pdf", "Bill"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.send(party("  "), PDF, "bill.pdf", "Bill"))
                .isInstanceOf(IllegalArgumentException.class);

        verifyNoInteractions(whatsapp);
    }
}
