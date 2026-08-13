package io.github.baeyung.hisaabkitaab.dto.whatsapp;

import java.time.Instant;

/**
 * One opt-out, as the back office lists it. Support is here because somebody rang up asking to
 * be put back on, so the row carries what that conversation is about: which shop, whose name,
 * which number, and when they asked us to stop.
 *
 * @param recipientName null when the party or member has since been deleted. The block stands
 *                      regardless — it was made about a number, and the number is still theirs.
 */
public record AdminBlockResponse(
        String id,
        String storeName,
        String recipientName,
        String contact,
        Instant blockedAt)
{
}
