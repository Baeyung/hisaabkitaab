package io.github.baeyung.hisaabkitaab.dto.event;

import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class EventRequest
{
    @NotNull
    TransactionEvent transactionEvent;
    Double cashAmount;
    Double billAmount;
    String details;
}
