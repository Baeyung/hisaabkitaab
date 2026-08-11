package io.github.baeyung.hisaabkitaab.dto.processing;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

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
 * The three sides are separate lists rather than one flat item list because they play
 * different parts in the arithmetic — raw and processing rows only contribute cost, and
 * only the output row's price is the one derived from them. See {@code ProcessingService}
 * for the calculation and what each side does to stock.
 */
@Getter
@Setter
public class ProcessingRequest
{
    /** At least one raw row — a batch with nothing to work on is not a batch. */
    @NotEmpty
    @Valid
    private List<RawLine> rawItems;

    /** At least one consumable — the dye or fuel that makes this processing rather than a rename. */
    @NotEmpty
    @Valid
    private List<ProcessingLine> processingItems;

    @NotNull
    @Valid
    private OutputLine output;

    private String billNumber;
    private LocalDate billDate;
    private String description;

    /**
     * A raw material: named and priced, but never a catalogue item. It holds no stock and
     * has no price list, so it exists only as a cost on this entry — kept on the transaction
     * so the batch can be read back whole, invisible to inventory.
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RawLine
    {
        private String name;
        private String unit;
        private BigDecimal quantity;
        private BigDecimal pricePerUnit;
    }

    /** A consumable taken out of stock — an existing item by id, or created from the typed name. */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ProcessingLine
    {
        private String itemId;
        private String name;
        private String unit;
        private BigDecimal quantity;
        private BigDecimal pricePerUnit;
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
