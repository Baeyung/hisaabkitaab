package io.github.baeyung.hisaabkitaab.dto.transactionline;

import java.math.BigDecimal;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TransactionLineRequest
{
    @NotBlank
    private String transactionId;

    @NotNull
    private TargetKind targetKind;

    private String partyId;

    private String itemId;

    @NotNull
    private InOut inOut;

    private BigDecimal quantity;

    private String unit;
}
