package io.github.baeyung.hisaabkitaab.dto.plan;

import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.enums.PlanTier;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Put a plan on an account. Until there is a payment provider this is the only way one gets
 * there, so an admin has to state the end date explicitly — there is nothing to renew it.
 *
 * <p>The limits are optional overrides; leave them out and the tier's own numbers apply.
 * {@code whatsappQuota} and {@code reminderContacts} may be zero (a zero quota is what makes a
 * trial a trial, and a zero reminder ceiling is how the monthly job is switched off below
 * Premium); {@code maxStores} and {@code maxUsers} may not — an account that can hold no stores
 * at all has no way to use the product.
 */
public record AssignPlanRequest(
        @NotNull PlanTier tier,
        @NotNull @Future LocalDate expiresAt,
        @Positive Integer maxStores,
        @Positive Integer maxUsers,
        @PositiveOrZero Integer whatsappQuota,
        Boolean dailyReports,
        @PositiveOrZero Integer reminderContacts)
{
}
