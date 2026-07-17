package io.github.baeyung.hisaabkitaab.dto.cashbook;

import java.time.LocalDate;
import java.util.List;

public record CashbookDayResponse(
        LocalDate day,
        double openingBalance,
        List<CashbookRowResponse> rows,
        double totalIn,
        double totalOut,
        double closingBalance
)
{
}
