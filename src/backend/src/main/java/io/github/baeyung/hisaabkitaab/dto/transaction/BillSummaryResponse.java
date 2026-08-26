package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;

public record BillSummaryResponse(
        String id,
        String billNumber,
        LocalDate date,
        String partyName,
        double amount,
        /** Cash that changed hands on it: taken in on a bill, paid out on a purchase. */
        double cashReceived,
        /** What was knocked off the bill before cash was weighed against it — see {@code Transaction#discount}. */
        double discount,
        /**
         * What this one document left on the khata — the same figure its detail page shows,
         * so the list can say whether {@code amount} was paid, part-paid, or all on udhaar
         * without opening the row. {@code discount} above is its own explicit figure now, not
         * read off this — this is only ever nonzero when cash and discount together still
         * don't reach the bill, and with no party on the document there is nowhere for that
         * gap to be collected from.
         */
        PartyBalance outstanding
)
{
}
