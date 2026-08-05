package io.github.baeyung.hisaabkitaab.dto.plan;

/**
 * The three numbers a plan is made of. Used twice in {@link PlanResponse} and meaning something
 * different each time: as the account's <em>effective</em> limits every field is filled in, and
 * as its <em>overrides</em> a null means that limit is left to the tier.
 */
public record PlanLimits(Integer maxStores, Integer maxUsers, Integer whatsappQuota)
{
}
