package io.github.baeyung.hisaabkitaab.service.query.support;

import java.math.BigDecimal;
import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

/**
 * The goods on a transaction, named for a row that carries no note: one item →
 * "Lawn Print × 12", several → "Lawn Print, Voile +2". Names and numerals only —
 * the wording around them ("Sold … to Rana") is the frontend's, so it follows
 * the UI language.
 */
public final class ItemSummary
{
    private ItemSummary()
    {
    }

    /** Null when the transaction moves no goods — cash entries, expenses, opening balances. */
    public static String of(Transaction transaction)
    {
        // Touches the transaction's line collection per row. That collection is batched
        // (Transaction.lines), which is the fix here — a fetch join on the row queries would
        // repeat the line they select as a root once per sibling and double-count balances.
        // A PROCESSING batch carries stock lines both ways — the dyes it burned as well as
        // the cloth it made. Only what it made names the row: "Processed Dye, Fuel" would
        // say the opposite of what happened.
        List<TransactionLine> stock = transaction.getLines()
                .stream()
                .filter(line -> line.getTargetKind() == TargetKind.STOCK && line.getItem() != null)
                .filter(line -> transaction.getEvent() != TransactionEvent.PROCESSING
                        || line.getInOut() == InOut.IN)
                .toList();

        if (stock.isEmpty())
        {
            return null;
        }

        if (stock.size() == 1)
        {
            TransactionLine line = stock.getFirst();
            return name(line) + quantity(line);
        }

        String firstTwo = name(stock.get(0)) + ", " + name(stock.get(1));
        int more = stock.size() - 2;
        return more > 0 ? firstTwo + " +" + more : firstTwo;
    }

    private static String name(TransactionLine line)
    {
        return line.getItem().getName();
    }

    private static String quantity(TransactionLine line)
    {
        BigDecimal quantity = line.getQuantity();
        return quantity == null ? "" : " × " + quantity.stripTrailingZeros().toPlainString();
    }
}
