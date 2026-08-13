package io.github.baeyung.hisaabkitaab.service.whatsapp;

/**
 * Who a document is going to, resolved from whatever the request named — a party's khata or
 * a person who works in the shop. Both reach WhatsApp the same way, so everything past
 * {@code ShareRecipientService} deals in this rather than in parties and users.
 *
 * @param name       the name the recipient is greeted by in the template.
 * @param contact    the number it goes to. Always read from the store's own data, never from
 *                   the request — a client cannot put a document on an arbitrary phone.
 * @param blockToken what the template's URL button appends: {@code storeId:recipientId}, which
 *                   opens the opt-out page ({@code /block/…}) for this exact recipient. Meta
 *                   requires every app-initiated template to carry a way out, and this is it,
 *                   so the same token shape goes to a party and to the shop's own people.
 */
public record Addressee(String name, String contact, String blockToken)
{
    /** The recipient's own id — the second half of the token, and the half a block is keyed on. */
    public String recipientId()
    {
        return blockToken.substring(blockToken.indexOf(':') + 1);
    }
}
