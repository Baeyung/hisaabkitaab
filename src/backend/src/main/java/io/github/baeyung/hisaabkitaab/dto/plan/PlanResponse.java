package io.github.baeyung.hisaabkitaab.dto.plan;

import java.time.Instant;
import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.entity.UserPlan;
import io.github.baeyung.hisaabkitaab.enums.PlanTier;

/**
 * An account's plan as the admin UI sees it: what it resolves to, and how much of that was
 * chosen by hand. Both {@link #limits()} and {@link #overrides()} are sent so the screen can
 * show "150 (Premium default)" against "150 (set for this account)" without knowing the tier
 * table itself.
 *
 * @param expiresAt null while the trial's clock has not started — see {@code UserPlan}.
 * @param expired   whether {@link #expiresAt()} has passed. False for a plan whose clock has
 *                  not started: nothing has been used up yet. An expired plan cannot sign in
 *                  and cannot create anything — see {@code PlanService} — so this is the one
 *                  field on the admin screen that says whether an account is shut out.
 */
public record PlanResponse(
        PlanTier tier,
        Instant assignedAt,
        LocalDate expiresAt,
        boolean expired,
        PlanLimits limits,
        PlanLimits overrides)
{
    public static PlanResponse of(UserPlan plan, LocalDate today)
    {
        return new PlanResponse(
                plan.getTier(),
                plan.getAssignedAt(),
                plan.getExpiresAt(),
                plan.getExpiresAt() != null && plan.getExpiresAt().isBefore(today),
                PlanLimits.effectiveFor(plan),
                PlanLimits.overridesOf(plan));
    }
}
