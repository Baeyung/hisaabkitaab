package io.github.baeyung.hisaabkitaab.dto.plan;

import io.github.baeyung.hisaabkitaab.entity.UserPlan;

/**
 * The three numbers a plan is made of. Used twice in {@link PlanResponse} and meaning something
 * different each time: as the account's <em>effective</em> limits every field is filled in, and
 * as its <em>overrides</em> a null means that limit is left to the tier.
 *
 * <p>{@link #effectiveFor} is the single definition of how an override and a tier combine.
 * Enforcement and the admin screen both go through it, so what a user is refused for is by
 * construction the same numbers the admin was shown.
 */
public record PlanLimits(Integer maxStores, Integer maxUsers, Integer whatsappQuota)
{
    /** What the account actually gets: its own overrides where set, the tier's numbers elsewhere. */
    public static PlanLimits effectiveFor(UserPlan plan)
    {
        return new PlanLimits(
                orDefault(plan.getMaxStores(), plan.getTier().getMaxStores()),
                orDefault(plan.getMaxUsers(), plan.getTier().getMaxUsers()),
                orDefault(plan.getWhatsappQuota(), plan.getTier().getWhatsappQuota()));
    }

    /** The overrides exactly as an admin set them, nulls and all. */
    public static PlanLimits overridesOf(UserPlan plan)
    {
        return new PlanLimits(plan.getMaxStores(), plan.getMaxUsers(), plan.getWhatsappQuota());
    }

    private static int orDefault(Integer override, int tierDefault)
    {
        return override != null ? override : tierDefault;
    }
}
