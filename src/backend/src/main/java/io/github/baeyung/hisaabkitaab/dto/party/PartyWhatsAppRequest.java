package io.github.baeyung.hisaabkitaab.dto.party;

import jakarta.validation.constraints.NotBlank;

/**
 * Send a party their bill or khata statement on WhatsApp.
 *
 * @param html     the printable page as the shopkeeper is looking at it — self-contained,
 *                 since the renderer resolves nothing relative to the app. It is rendered
 *                 to PDF server-side rather than sent as one, so a client cannot post
 *                 arbitrary bytes to a customer's phone.
 * @param caption  what the document is, in the shopkeeper's words: "Bill SALE-016 — Kiryana
 *                 Store". Shown with the attachment, and fills the approved template's
 *                 single placeholder.
 * @param filename the name the party sees on the attachment.
 */
public record PartyWhatsAppRequest(
        @NotBlank String html,
        @NotBlank String caption,
        @NotBlank String filename
)
{
}
