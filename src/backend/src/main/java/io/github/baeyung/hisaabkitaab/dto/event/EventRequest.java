package io.github.baeyung.hisaabkitaab.dto.event;

import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Getter
@Setter
public class EventRequest
{
    @NotNull
    TransactionEvent transactionEvent;
    Double cashAmount;
    Double billAmount;
    /** Knocked off the bill before cash is weighed against it — SALE/PURCHASE only. */
    Double discountAmount;
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
        /**
         * The unit this line was written in — carried only so that an item first named here
         * is created in it rather than in a guess. Nothing else reads it: {@code quantity} has
         * already been converted to the item's own shelf unit by the entry screen, which is
         * the only unit stock is ever counted in. Blank where the shop has switched the unit
         * box off, and then the store's default unit stands in.
         */
        @Size(max = 64)
        private String unit;
        private BigDecimal quantity;
        private Double itemSoldAt;
        /**
         * The shop's own entry columns for this line, when it has configured any — see
         * {@code TransactionLine.customFields}. Null (and absent on the way back out) for
         * every shop that has not, which the entry screen reads as its two default columns.
         *
         * <p>Capped at a size the grid could plausibly show. The cap is here rather than in
         * the converter because this is the boundary; key length is capped there, because a
         * map's keys are not reachable from bean validation.
         */
        @Size(max = 32)
        private Map<String, BigDecimal> customFields;
    }
}
