package io.github.baeyung.hisaabkitaab.dto.plan;

import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.enums.PlanTier;

/**
 * The signed-in user's own plan, as the app needs it to decide what to offer. Distinct from
 * {@link PlanResponse}, which is the admin's view: this one carries {@link #usage} — what the
 * account has actually spent against its limits — and drops the overrides, which are the
 * admin's business and not something a customer should be shown.
 *
 * @param enforced false when {@code app.plans.enabled} is off, in which case the limits are
 *                 reported for display but nothing is refused. The UI must not grey out a
 *                 button on numbers that will not actually be enforced.
 * @param usage    counted the same way the limits are: {@code stores} is the shops this user
 *                 <em>owns</em> (shops shared with them belong to someone else's plan), and
 *                 {@code users} counts them plus everyone distinct they have shared any of
 *                 those shops with.
 */
public record PlanStatusResponse(
        PlanTier tier,
        LocalDate expiresAt,
        boolean expired,
        boolean enforced,
        PlanLimits limits,
        PlanUsage usage)
{
    /** What has been spent against {@link PlanStatusResponse#limits()}, in the same units. */
    public record PlanUsage(int stores, int users)
    {
    }
}
