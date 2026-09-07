package io.github.baeyung.hisaabkitaab.dto.transaction;

import java.math.BigDecimal;
import java.util.Map;

/**
 * One line of goods on a saved bill or purchase.
 *
 * @param customFields the shop's own entry columns for this line, or null for a line written
 *                     before it had any — which the client reads as its two default columns,
 *                     {@code quantity} and {@code rate}, off the two fields above. A bill
 *                     renders the columns it actually stored rather than the ones the shop is
 *                     configured with today, so removing a column never leaves an old bill
 *                     showing numbers that do not multiply out to its own total.
 */
public record BillLineResponse(
        String itemId,
        String itemName,
        BigDecimal quantity,
        String unit,
        double rate,
        double amount,
        Map<String, BigDecimal> customFields
)
{
}
