package io.github.baeyung.hisaabkitaab.dto.processing;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * One processed-goods batch, read back for the list screen: what came out, and the raw
 * material and consumables it was made from. The inverse of {@link ProcessingRequest},
 * minus the item ids the entry screen needed — this is a record, not a form to reopen.
 */
public record ProcessingResponse(
        String transactionId,
        LocalDate date,
        String billNumber,
        String description,
        /**
         * Who the whole batch was run for. Only ever set on batches booked before the party
         * moved onto the individual rows; null on every new one, where {@link InputRow#partyName}
         * carries it instead.
         */
        String partyId,
        String partyName,
        List<InputRow> rawItems,
        List<InputRow> processingItems,
        OutputRow output,
        /** Whether the caller may still take this entry back (see Transaction.DELETE_WINDOW). */
        boolean recent
)
{
    /** An input row; {@code partyId} is set when it was bought in rather than taken off the shelf. */
    public record InputRow(
            String name,
            String unit,
            BigDecimal quantity,
            BigDecimal pricePerUnit,
            String partyId,
            String partyName
    )
    {
        /** What this row contributed to the batch's cost. */
        public BigDecimal amount()
        {
            return quantity == null || pricePerUnit == null
                    ? BigDecimal.ZERO
                    : quantity.multiply(pricePerUnit);
        }
    }

    public record OutputRow(
            String itemId,
            String name,
            String unit,
            BigDecimal quantity,
            BigDecimal unitCost,
            BigDecimal wastage
    )
    {
    }
}
