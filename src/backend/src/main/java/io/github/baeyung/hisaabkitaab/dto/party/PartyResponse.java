package io.github.baeyung.hisaabkitaab.dto.party;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;
import io.github.baeyung.hisaabkitaab.entity.Party;

/**
 * A party for the settings list: its editable fields plus the current opening
 * balance ({@code null} when none is set), so the row can show it and the
 * opening-balance editor can prefill.
 */
public record PartyResponse(
        String id,
        String name,
        String contact,
        String address,
        PartyBalance openingBalance
)
{
    public static PartyResponse of(Party party, PartyBalance openingBalance)
    {
        return new PartyResponse(party.getId(), party.getName(), party.getContact(), party.getAddress(), openingBalance);
    }
}
