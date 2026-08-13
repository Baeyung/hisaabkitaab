package io.github.baeyung.hisaabkitaab.dto.whatsapp;

import io.github.baeyung.hisaabkitaab.enums.StoreRole;

/**
 * Someone in the shop a document can be sent to: the owner, or a user they have shared it
 * with. Only people with a number that can actually be messaged appear — there is nothing to
 * offer for the rest.
 *
 * <p>Deliberately without a phone number. The send resolves the recipient's number here on
 * the server, so nothing is gained by handing every viewer their colleagues' numbers.
 *
 * @param name    the person's own name — {@code null} is impossible here, since an account with
 *                no name behind it is an outstanding invite and has no number to send to either.
 * @param blocked whether they have told this shop to stop messaging them. The send refuses
 *                either way; this is so the picker can say so before the button is pressed
 *                rather than after.
 */
public record ShareRecipient(String userId, String name, StoreRole role, boolean blocked)
{
}
