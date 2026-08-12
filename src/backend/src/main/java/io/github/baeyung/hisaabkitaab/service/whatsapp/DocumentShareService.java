package io.github.baeyung.hisaabkitaab.service.whatsapp;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.github.baeyung.hisaabkitaab.entity.Party;
import io.github.baeyung.hisaabkitaab.entity.Store;
import lombok.RequiredArgsConstructor;

/**
 * Sends a party a document the shop produced — a bill, a khata statement, a cashbook — as a
 * PDF on WhatsApp, through the approved {@code document_share} template. The action-specific
 * service {@code WhatsAppService} asks callers to go through, mirroring {@code service/mail}.
 * <p>
 * Anything with a store, a party and a PDF can call {@link #share}; nothing here is bill- or
 * ledger-specific beyond the {@code action} word the caller supplies.
 */
@Service
@RequiredArgsConstructor
public class DocumentShareService
{
    private final WhatsAppService whatsAppService;

    /**
     * The approved template: a document header, four body placeholders, and a dynamic URL
     * button. Configurable only so a new approved version can be rolled out without a deploy.
     */
    @Value("${app.whatsapp.document-template:document_share}")
    private String templateName;

    /**
     * The same template is approved once per language, and Meta keys them by their own locale
     * codes rather than ours.
     */
    private static String templateLanguage(String locale)
    {
        return "ur".equals(locale) ? "ur" : "en";
    }

    /**
     * A party is only messageable on a number a person actually answers: no number at all, or
     * the placeholder {@link Party#PLACEHOLDER_CONTACT} left by a party created in passing,
     * means there is nowhere to send. Callers charge quota before sending, so they check this
     * first — a message that cannot go out must not cost one.
     *
     * @throws IllegalArgumentException when the party has no real phone number.
     */
    public static void requireSendable(Party party)
    {
        String contact = party.getContact();
        if (contact == null || contact.isBlank() || Party.PLACEHOLDER_CONTACT.equals(contact))
        {
            throw new IllegalArgumentException("Party has no phone number to send to on WhatsApp");
        }
    }

    /**
     * @param action what was shared, in the reader's language and matching {@code locale} —
     *               "Bill", "Khata statement", "بل". Reads inside the template's sentence, so
     *               it is a noun, not a whole caption.
     * @param locale {@code en} or {@code ur}; picks which approved template goes out.
     * @return whether Meta accepted the message. False for a send that was rejected or
     *         suppressed — the caller charges the account's WhatsApp quota for this message,
     *         and must give it back when nothing actually went out.
     * @throws IllegalArgumentException when the party has no phone number to send to.
     */
    public boolean share(Store store, Party party, String action, byte[] pdf, String filename, String locale)
    {
        requireSendable(party);
        String contact = party.getContact();

        // The names the approved template declares. Meta rejects the send if one is missing
        // or unknown, so these spellings are the contract — not the order.
        Map<String, String> body = new LinkedHashMap<>();
        body.put("recepient_name", party.getName());
        body.put("action", action);
        body.put("provider_name", store.getName());
        body.put("contact_number", storeContact(store));

        return whatsAppService.sendTemplateWithDocument(
                contact,
                templateName,
                templateLanguage(locale),
                pdf,
                filename,
                body,
                // The button URL's {{1}} and {{2}}, which stay positional: which shop, whose
                // khata.
                List.of(store.getId() + "/" + party.getId()));
    }

    /**
     * A shop's own number is optional, and Meta rejects a blank template parameter — so fall
     * back to the owner's, which is their login and therefore always there.
     */
    private static String storeContact(Store store)
    {
        String contact = store.getContact();
        return contact == null || contact.isBlank() ? store.getOwner().getContactNumber() : contact;
    }
}
