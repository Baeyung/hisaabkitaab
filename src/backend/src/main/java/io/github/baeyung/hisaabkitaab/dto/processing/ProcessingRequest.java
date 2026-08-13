package io.github.baeyung.hisaabkitaab.dto.processing;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import io.github.baeyung.hisaabkitaab.dto.event.EventRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One batch of processed goods: raw material plus consumables in, a different item out.
 *
 * The two input sides are separate lists rather than one flat list because the screen asks
 * for them separately and reads them back that way — the arithmetic treats them alike, both
 * contributing cost and both coming off the shelf. See {@code ProcessingService} for the
 * calculation and what each side does to stock.
 */
@Getter
@Setter
public class ProcessingRequest
{
    /** At least one raw row — a batch with nothing to work on is not a batch. */
    @NotEmpty
    @Valid
    private List<InputLine> rawItems;

    /** At least one consumable — the dye or fuel that makes this processing rather than a rename. */
    @NotEmpty
    @Valid
    private List<InputLine> processingItems;

    @NotNull
    @Valid
    private OutputLine output;

    private String billNumber;
    private LocalDate billDate;
    private String description;

    /**
     * One input row: what the batch consumed, and — when it was bought in for the batch
     * rather than taken off the shelf — who it was bought from and what was handed over
     * for it.
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InputLine
    {
        private String itemId;
        private String name;
        private String unit;
        private BigDecimal quantity;
        private BigDecimal pricePerUnit;

        /**
         * Who this row was bought from, optional — the same {id, name} pair every other entry
         * sends, resolved (or created) the same way. Set, and the row is purchased before it
         * is consumed: see {@code ProcessingService#purchaseInputs}. Null, and the row simply
         * comes off the shelf.
         */
        private EventRequest.Party party;

        /** Cash handed over for this row now; the rest stays on the party's khata. Null = nothing. */
        private BigDecimal paid;

        /**
         * Work rather than goods — dyeing charges, labour. Set on the catalogue item, not the
         * line ({@link io.github.baeyung.hisaabkitaab.entity.StoreItem#isService()}), because
         * it says what the thing <em>is</em>: a service keeps no stock anywhere in the app, so
         * the row still costs the batch and still lands in the supplier's khata, and only the
         * on-hand quantity goes away.
         */
        private boolean service;
    }

    /**
     * What the batch produced, added to stock. {@code unitCost} is what the screen computed
     * (total input cost ÷ output quantity) or whatever the shopkeeper typed over it —
     * either way it is the figure the item's cost price is averaged against.
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class OutputLine
    {
        private String itemId;
        private String name;
        private String unit;
        private BigDecimal quantity;
        private BigDecimal unitCost;
        /** What the batch lost — recorded, but it moves no stock and costs nothing. */
        private BigDecimal wastage;
    }
}
