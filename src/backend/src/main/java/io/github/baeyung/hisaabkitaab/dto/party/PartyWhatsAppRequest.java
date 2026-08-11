package io.github.baeyung.hisaabkitaab.dto.party;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * Send a party a document on WhatsApp.
 *
 * @param html     the printable page as the shopkeeper is looking at it — self-contained,
 *                 since the renderer resolves nothing relative to the app. It is rendered
 *                 to PDF server-side rather than sent as one, so a client cannot post
 *                 arbitrary bytes to a customer's phone.
 * @param filename the name the party sees on the attachment.
 * @param action   what is being shared, worded in {@code locale}: "Bill", "Khata statement".
 *                 Fills the template's action placeholder, so it reads inside a sentence.
 * @param locale   which language's approved template to send, {@code en} or {@code ur}.
 */
public record PartyWhatsAppRequest(
        @NotBlank String html,
        @NotBlank String filename,
        @NotBlank String action,
        @NotBlank @Pattern(regexp = "en|ur") String locale
)
{
}
