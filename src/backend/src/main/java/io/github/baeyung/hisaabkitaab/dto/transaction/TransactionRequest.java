package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.time.LocalDate;

import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TransactionRequest
{
    @NotBlank
    private String storeId;

    @NotNull
    private TransactionEvent event;

    private String partyId;

    private String bill;

    private LocalDate eventDate;

    private LocalDate entryDate;

    private String description;
}
