package io.github.baeyung.hisaabkitaab.dto.transactionline;

import java.math.BigDecimal;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
@AllArgsConstructor
public class TransactionLineResponse
{
    private String id;

    private String transactionId;

    private TargetKind targetKind;

    private String partyId;

    private String itemId;

    private InOut inOut;

    private BigDecimal quantity;

    private String unit;
}
