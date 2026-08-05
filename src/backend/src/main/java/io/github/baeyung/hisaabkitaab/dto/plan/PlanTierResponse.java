package io.github.baeyung.hisaabkitaab.dto.plan;

import java.util.Arrays;
import java.util.List;

import io.github.baeyung.hisaabkitaab.enums.PlanTier;

/**
 * The tier catalogue, so the admin screen can show what each tier grants — and therefore what
 * an override is overriding — without keeping its own copy of the numbers.
 */
public record PlanTierResponse(PlanTier tier, int maxStores, int maxUsers, int whatsappQuota)
{
    public static List<PlanTierResponse> all()
    {
        return Arrays.stream(PlanTier.values())
                .map(tier -> new PlanTierResponse(
                        tier, tier.getMaxStores(), tier.getMaxUsers(), tier.getWhatsappQuota()))
                .toList();
    }
}
