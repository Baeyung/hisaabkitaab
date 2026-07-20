package io.github.baeyung.hisaabkitaab.service.query.support;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.OptionalLong;

/**
 * FIFO receivable aging. Given a party's dated charges (what they were billed)
 * and payments (what they paid) in chronological order, payments settle the
 * oldest charges first; whatever charge is still unpaid at the end is the oldest
 * due, and its date is how stale the party's balance is.
 *
 * Returns empty when nothing is outstanding — a non-empty queue means payments
 * never caught up with charges, which is exactly the party being net-owing.
 */
public final class ReceivableAging
{
    private ReceivableAging()
    {
    }

    /** One dated ledger movement: a {@code charge} (owed) or a {@code payment} (received), one side zero. */
    public record Movement(long epochDay, double charge, double payment)
    {
    }

    /** Epoch-day of the oldest still-unpaid charge after FIFO settlement, or empty if square/in-credit. */
    public static OptionalLong oldestUnpaidEpochDay(List<Movement> movements)
    {
        Deque<double[]> unpaid = new ArrayDeque<>(); // FIFO of [epochDay, remaining]
        for (Movement m : movements)
        {
            if (m.charge() > 0.005)
            {
                unpaid.addLast(new double[] { m.epochDay(), m.charge() });
            }
            double pay = m.payment();
            while (pay > 0.005 && !unpaid.isEmpty())
            {
                double[] head = unpaid.peekFirst();
                if (head[1] <= pay + 0.005)
                {
                    pay -= head[1];
                    unpaid.removeFirst();
                }
                else
                {
                    head[1] -= pay;
                    pay = 0;
                }
            }
        }
        return unpaid.isEmpty() ? OptionalLong.empty() : OptionalLong.of((long) unpaid.peekFirst()[0]);
    }
}
