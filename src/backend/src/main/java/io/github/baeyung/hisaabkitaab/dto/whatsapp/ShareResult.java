package io.github.baeyung.hisaabkitaab.dto.whatsapp;

import java.util.List;

/**
 * What actually happened, recipient by recipient. A send to several people can succeed for
 * some and not others, so the outcome is a body rather than a status: "sent to 2 of 3" is
 * something only the caller can say, and neither 202 nor 502 can say it.
 *
 * @param sent   how many messages went out. Only these were charged — anything that failed
 *               was given back to the shop owner's quota.
 * @param failed the names of the people it did not reach, for the screen to name back.
 */
public record ShareResult(int sent, List<String> failed)
{
}
