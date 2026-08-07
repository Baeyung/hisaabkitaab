package io.github.baeyung.hisaabkitaab.enums;

import io.github.baeyung.hisaabkitaab.dto.plan.PlanLimits;
import lombok.Getter;

/**
 * A thing a plan puts a standing ceiling on, and which something may therefore be asked to
 * check before letting a call through — see {@code @RequiresPlanCapacity}.
 *
 * <p>{@code whatsappQuota} is deliberately not one of these. It is spent per message over a
 * period rather than counted as a standing total, so "how many are there right now" is not the
 * question to ask of it, and a shared enum that pretended otherwise would only mislead.
 *
 * <p>The nouns are here rather than in the aspect so the refusal a user reads names the thing
 * they tried to add ("your Basic plan covers 1 shop") without the check site knowing any
 * wording.
 */
@Getter
public enum PlanCapacity
{
    STORES("shop", "shops"),
    USERS("user", "users");

    private final String singular;

    private final String plural;

    PlanCapacity(String singular, String plural)
    {
        this.singular = singular;
        this.plural = plural;
    }

    /** This capacity's ceiling out of an account's resolved limits. */
    public int limitOf(PlanLimits limits)
    {
        return this == STORES ? limits.maxStores() : limits.maxUsers();
    }

    /** {@code "1 shop"} / {@code "3 users"} — the ceiling as it is read back to the user. */
    public String describe(int count)
    {
        return count + " " + (count == 1 ? singular : plural);
    }
}
