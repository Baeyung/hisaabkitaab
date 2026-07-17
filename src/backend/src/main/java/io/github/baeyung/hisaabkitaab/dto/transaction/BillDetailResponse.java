package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.time.LocalDate;
import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.common.PartyBalance;

public record BillDetailResponse(
        String id,
        String billNumber,
        LocalDate date,
        String description,
        String partyName,
        List<BillLineResponse> lines,
        double goodsTotal,
        double cashReceived,
        PartyBalance outstanding
)
{
}
