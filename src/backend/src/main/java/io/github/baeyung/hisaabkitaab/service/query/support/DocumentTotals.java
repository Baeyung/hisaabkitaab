package io.github.baeyung.hisaabkitaab.service.query.support;

import io.github.baeyung.hisaabkitaab.entity.Transaction;
import io.github.baeyung.hisaabkitaab.entity.TransactionLine;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;

/**
 * The two figures every goods entry is made of: what the goods came to, and what cash
 * changed hands over them. Between them they explain the third — what the entry left on
 * the party's khata — which is the only one a statement row used to show.
 *
 * One definition, because three screens read the same entry from different sides: the bill
 * and purchase lists, the document's own page, and the khata statement. If they computed
 * it separately they could disagree about the same piece of paper.
 */
public final class DocumentTotals
{
    private DocumentTotals()
    {
    }

    /**
     * Σ(quantity × rate) over the entry's goods — the number the entry screen showed and
     * the bill total the party was charged. Recomputed from the lines rather than read off
     * a STOCK line's {@code value}, which only repeats the transaction's cash amount.
     */
    public static double goods(Transaction transaction)
    {
        return transaction.getLines()
                .stream()
                .filter(line -> line.getTargetKind() == TargetKind.STOCK)
                .mapToDouble(DocumentTotals::lineAmount)
                .sum();
    }

    /**
     * The cash side of the entry: taken in on a sale or a receipt, paid out on a purchase
     * or a payment. The two are mirrors, so one sum serves both — which way it went is
     * already on the row, in the entry's own event.
     */
    public static double cash(Transaction transaction)
    {
        return transaction.getLines()
                .stream()
                .filter(line -> line.getTargetKind() == TargetKind.CASH)
                .mapToDouble(DocumentTotals::value)
                .sum();
    }

    private static double lineAmount(TransactionLine line)
    {
        double rate = line.getItemSoldAt() != null ? line.getItemSoldAt() : 0;
        double quantity = line.getQuantity() != null ? line.getQuantity().doubleValue() : 0;
        return quantity * rate;
    }

    private static double value(TransactionLine line)
    {
        return line.getValue() != null ? line.getValue() : 0;
    }
}
