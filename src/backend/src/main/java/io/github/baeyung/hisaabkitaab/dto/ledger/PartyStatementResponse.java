package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.time.LocalDate;
import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;

public record PartyStatementResponse(
        String partyId,
        String partyName,
        String contact,
        List<PartyStatementRowResponse> rows,
        PartyBalance currentBalance,
        /** Σ of charges (what the party was billed) — the report header's "total billed". */
        double totalBilled,
        /** Σ of payments received/made against this party. */
        double totalPaid,
        /** Business date of the most recent payment, or null if none yet. */
        LocalDate lastPaymentDate
)
{
}
