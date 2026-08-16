package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;

public record BillSummaryResponse(
        String id,
        String billNumber,
        LocalDate date,
        String partyName,
        double amount,
        /**
         * What this one document left on the khata — the same figure its detail page shows,
         * so the list can say whether {@code amount} was paid, part-paid, or all on udhaar
         * without opening the row. With nobody on the document there is no khata to put it
         * on and an unbalanced one is a discount instead; the reader tells the two apart by
         * {@code partyName}, exactly as the detail page does.
         */
        PartyBalance outstanding
)
{
}
