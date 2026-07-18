package io.github.baeyung.hisaabkitaab.dto.opening;

import io.github.baeyung.hisaabkitaab.dto.common.BalanceDirection;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Set a party's opening balance: the amount they carried in, and which way it
 * points in the shopkeeper's language. {@code THEY_OWE_YOU} → an IN party line,
 * {@code YOU_OWE_THEM} → OUT; zero clears the opening (see OpeningEntryService).
 */
public record OpeningBalanceRequest(
        @NotNull @PositiveOrZero Double amount,
        @NotNull BalanceDirection direction
)
{
}
