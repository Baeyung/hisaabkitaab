package io.github.baeyung.hisaabkitaab.dto.opening;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Set the store's opening drawer balance: the cash on hand at onboarding.
 * Zero clears it (see OpeningEntryService). Physical cash, so never negative.
 */
public record OpeningCashRequest(
        @NotNull @PositiveOrZero Double amount
)
{
}
