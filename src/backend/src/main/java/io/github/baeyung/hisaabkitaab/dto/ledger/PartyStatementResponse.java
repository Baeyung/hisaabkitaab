package io.github.baeyung.hisaabkitaab.dto.ledger;

import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;

public record PartyStatementResponse(
        String partyId,
        String partyName,
        String contact,
        List<PartyStatementRowResponse> rows,
        PartyBalance currentBalance
)
{
}
