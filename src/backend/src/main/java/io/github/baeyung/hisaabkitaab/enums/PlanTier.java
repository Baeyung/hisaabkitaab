package io.github.baeyung.hisaabkitaab.enums;

import lombok.Getter;

/**
 * What a paying account is entitled to. The numbers here are the <em>defaults</em> for a tier;
 * an individual account may carry overrides (see {@code UserPlan}), which is how an Enterprise
 * deal gets limits nobody else has without a tier of its own being invented per customer.
 *
 * <p>{@code maxUsers} counts <em>everyone</em> who can reach the account's stores, the owner
 * included — so Basic's "1 user" means the owner working alone, and Premium's 3 means the owner
 * plus two invited members.
 *
 * <p>{@link #ENTERPRISE} deliberately defaults to the same numbers as {@link #PREMIUM_PLUS}
 * rather than to unlimited: an Enterprise account whose overrides were never filled in should
 * be merely generous, not unbounded.
 */
@Getter
public enum PlanTier
{
    /** Where every fresh signup lands: Basic's limits for a month, with WhatsApp switched off. */
    TRIAL(1, 1, 0),
    BASIC(1, 1, 50),
    PREMIUM(2, 3, 150),
    PREMIUM_PLUS(6, 8, 250),
    ENTERPRISE(6, 8, 250);

    private final int maxStores;

    private final int maxUsers;

    private final int whatsappQuota;

    PlanTier(int maxStores, int maxUsers, int whatsappQuota)
    {
        this.maxStores = maxStores;
        this.maxUsers = maxUsers;
        this.whatsappQuota = whatsappQuota;
    }
}
