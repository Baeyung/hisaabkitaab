package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.util.List;

/**
 * Walk-in cash trade of one kind (SALE or PURCHASE) collapsed into a khata head:
 * how many entries, their grand total, and the entries themselves for drill-down.
 */
public record CashGroupResponse(
        String kind,
        long count,
        double total,
        List<CashRowResponse> rows
)
{
}
