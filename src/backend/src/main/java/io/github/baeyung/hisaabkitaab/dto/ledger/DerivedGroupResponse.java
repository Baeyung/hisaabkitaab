package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.util.List;

/**
 * A set of same-description expenses shown in the khata under "derived": the
 * display name (first entry's text), how many entries, their total spend, and
 * the entries themselves for inline drill-down.
 */
public record DerivedGroupResponse(
        String description,
        long count,
        double total,
        List<DerivedStatementRowResponse> rows
)
{
}
