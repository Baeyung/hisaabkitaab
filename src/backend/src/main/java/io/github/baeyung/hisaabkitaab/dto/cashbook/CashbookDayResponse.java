package io.github.baeyung.hisaabkitaab.dto.cashbook;

import java.time.LocalDate;
import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;

public record CashbookDayResponse(
        LocalDate from,
        LocalDate to,
        double openingBalance,
        List<CashbookRowResponse> rows,
        double totalIn,
        double totalOut,
        /**
         * Which way the khata moved over the whole range, netted — the counterpart to
         * {@code totalIn}/{@code totalOut}. Sums exactly the rows shown, so it is the
         * column's own total and nothing else.
         */
        PartyBalance totalKhata,
        double closingBalance
)
{
}
