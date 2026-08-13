package io.github.baeyung.hisaabkitaab.dto.whatsapp;

import java.util.List;

/**
 * Everything the send picker needs to draw itself in one answer.
 *
 * <p>The party is not in {@code people} — the screen doing the sending already knows which
 * party it is about, and only ever needed telling whether that one has opted out.
 *
 * @param partyBlocked whether the party named in the request has blocked this shop. False when
 *                     no party was named, which is every shop-wide printout.
 */
public record ShareRecipients(List<ShareRecipient> people, boolean partyBlocked)
{
}
