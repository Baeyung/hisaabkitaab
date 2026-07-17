package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.time.LocalDate;

public record BillSummaryResponse(
        String id,
        String billNumber,
        LocalDate date,
        String partyName,
        double amount
)
{
}
