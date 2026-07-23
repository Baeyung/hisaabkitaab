package io.github.baeyung.hisaabkitaab.service.query.support;

import java.math.BigDecimal;
import java.util.List;

import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;

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
        // ponytail: touches the transaction's line collection per row (lazy load).
        // Add a fetch join to the row queries if a long cashbook range gets slow.
        List<TransactionLine> stock = transaction.getLines()
                .stream()
                .filter(line -> line.getTargetKind() == TargetKind.STOCK && line.getItem() != null)
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
