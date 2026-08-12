package io.github.baeyung.hisaabkitaab.service.whatsapp;

/**
 * Who a document is going to, resolved from whatever the request named — a party's khata or
 * a person who works in the shop. Both reach WhatsApp the same way, so everything past
 * {@code ShareRecipientService} deals in this rather than in parties and users.
 *
 * @param name    the name the recipient is greeted by in the template.
 * @param contact the number it goes to. Always read from the store's own data, never from
 *                the request — a client cannot put a document on an arbitrary phone.
 * @param link    what the template's URL button appends: the party's khata for a party,
 *                and the shop itself for someone who works in it.
 */
public record Addressee(String name, String contact, String link)
{
}
