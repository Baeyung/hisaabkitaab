package io.github.baeyung.hisaabkitaab.dto.event;

import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class EventRequest
{
    @NotNull
    TransactionEvent transactionEvent;
    @NotNull
    String partyId;
    Double cashAmount;
    Double billAmount;
    String description;
    String billNumber;
    LocalDate billDate;
    Party party;
    Item item;


    @Getter
    @Setter
    @AllArgsConstructor
    public static class Party {
        private String partyId;
        private String name;
    }
    @Getter
    @Setter
    @AllArgsConstructor
    public static class Item {
        private String itemId;
        private String name;
    }
}
