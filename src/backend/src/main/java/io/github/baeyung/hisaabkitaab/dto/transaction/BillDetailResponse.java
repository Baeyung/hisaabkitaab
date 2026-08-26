package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.time.LocalDate;
import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;

public record BillDetailResponse(
        String id,
        String billNumber,
        LocalDate date,
        String description,
        String partyId,
        String partyName,
        /** The party's phone number, so the bill screen can offer to WhatsApp it to them. */
        String partyContact,
        List<BillLineResponse> lines,
        double goodsTotal,
        double cashReceived,
        /** What was knocked off the bill before cash was weighed against it — see {@code Transaction#discount}. */
        double discount,
        PartyBalance outstanding
)
{
}
