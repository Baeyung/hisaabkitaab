package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.util.List;

/**
 * All expenses of one category collapsed into a khata head: the category name,
 * how many entries, their total spend, and the entries themselves for inline
 * drill-down.
 */
public record ExpenseCategoryGroupResponse(
        String category,
        long count,
        double total,
        List<ExpenseCategoryRowResponse> rows
)
{
}
