package io.github.baeyung.hisaabkitaab.service.whatsapp;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.github.baeyung.hisaabkitaab.entity.Party;
import lombok.RequiredArgsConstructor;

/**
 * Sends a party the printout the shopkeeper is looking at — a bill or a khata statement —
 * as a PDF on WhatsApp. The action-specific service {@code WhatsAppService} asks callers to
 * go through, mirroring {@code service/mail}.
 */
@Service
@RequiredArgsConstructor
public class PartyDocumentService
{
    private final WhatsAppService whatsAppService;

    /**
     * The approved template carrying a document header. Blank until Meta approves ours, and
     * while it is blank we fall back to a free-form document — which Meta only delivers
     * inside the 24-hour window the party's own last message opened. Set the name here and
     * app-initiated sends start working with no code change.
     */
    @Value("${app.whatsapp.document-template:}")
    private String templateName;

    /** The template's own locale — a separate template exists per language. */
    @Value("${app.whatsapp.document-template-language:en_US}")
    private String templateLanguage;

    /**
     * @param caption what the document is, in the shopkeeper's words — "Bill #1042 from
     *                Rehman Cloth House". Also the template's single {{1}} placeholder.
     * @throws IllegalArgumentException when the party has no phone number to send to.
     */
    public void send(Party party, byte[] pdf, String filename, String caption)
    {
        String contact = party.getContact();
        if (contact == null || contact.isBlank())
        {
            throw new IllegalArgumentException("Party has no phone number to send to on WhatsApp");
        }

        if (templateName.isBlank())
        {
            whatsAppService.sendDocument(contact, pdf, filename, caption);
            return;
        }
        whatsAppService.sendTemplateWithDocument(contact, templateName, templateLanguage, pdf, filename, caption);
    }
}
