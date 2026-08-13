package io.github.baeyung.hisaabkitaab.dto.whatsapp;

/**
 * What the opt-out page shows the person who followed the link out of a WhatsApp message:
 * enough to recognise which shop and which record this is about, and nothing more. The page is
 * public, so every field here is answerable to anyone holding the link.
 *
 * @param storeName     the shop that has been messaging them — the one thing they will
 *                      recognise, since the messages arrive from our number and not the shop's.
 * @param recipientName the name the shop keeps them under.
 * @param contactLast4  the last four digits of the number that would be blocked, so they can
 *                      tell it is their phone. Never the whole number: the link is all it takes
 *                      to reach this, and a forwarded message should not hand a stranger one.
 * @param blocked       whether the block is already in place — the page opens finished rather
 *                      than asking a second time.
 */
public record BlockStatus(String storeName, String recipientName, String contactLast4, boolean blocked)
{
}
