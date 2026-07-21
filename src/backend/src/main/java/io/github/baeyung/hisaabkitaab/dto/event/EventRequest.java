package io.github.baeyung.hisaabkitaab.dto.event;

import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Getter
@Setter
public class EventRequest
{
    @NotNull
    TransactionEvent transactionEvent;
    Double cashAmount;
    Double billAmount;
    String description;
    String billNumber;
    LocalDate billDate;
    Party party;
    List<Item> items;
    /** The spend head for an EXPENSE, by name; blank defaults to UNCATEGORIZED. Auto-created if new. */
    String expenseCategory;


    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Party {
        private String partyId;
        private String name;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Item {
        private String itemId;
        private String name;
        private BigDecimal quantity;
        private Double itemSoldAt;
    }
}
