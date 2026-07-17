package io.github.baeyung.hisaabkitaab.dto.ledger;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;

public record PartyBalanceResponse(
        String partyId,
        String name,
        String contact,
        PartyBalance balance
)
{
}
