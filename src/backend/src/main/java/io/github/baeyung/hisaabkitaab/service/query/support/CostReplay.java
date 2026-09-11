package io.github.baeyung.hisaabkitaab.service.query.support;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;

/**
 * What each sale actually cost the shop, reconstructed by walking its goods history.
 *
 * <p>An item's {@code costPrice} is one number: what the last purchase left it at. That is the
 * right figure to price the <em>next</em> bill with, and the wrong one to judge a bill from three
 * months ago by — cloth bought at 90 and sold at 110 did not lose money because the mill has since
 * put its rate up to 120. So profit is not read off the catalogue; it is replayed.
 *
 * <p>The walk keeps a pool per item — how much is on the shelf and what it is carried at. Goods in
 * raise the pool and move its weighted average, a sale takes goods out at the average standing that
 * day, and goods out for any other reason lower the pool without booking anything. That average is
 * the cost the sale faced.
 *
 * <p>Six things this handles that a plain qty×rate sum would get wrong:
 * <ol>
 *   <li>A bill's discount belongs to its lines, pro-rata by value — on a purchase it lowers what
 *       the goods cost, on a sale it lowers what they earned.</li>
 *   <li>An opening-stock line carries a count and no rate, so its cost is the item's own
 *       {@code costPrice} — the one figure the shopkeeper did type.</li>
 *   <li>A PROCESSING batch consumes raw material and produces finished goods. Only the output
 *       enters a pool, at the rate the batch folded its inputs into; counting the inputs as a cost
 *       too would charge the shop twice for the same cloth.</li>
 *   <li>Overselling — more sold than the books say was ever bought — empties the pool without
 *       taking its average negative, so the next purchase still weighs against something sane.</li>
 *   <li>An item sold with nothing behind it is reported as <em>uncosted</em>, never as free. A zero
 *       there would read as pure profit, which is a lie in the direction that flatters.</li>
 *   <li>Money is compared with a tolerance, not with {@code ==}: these are doubles folded over
 *       thousands of lines.</li>
 * </ol>
 *
 * <p>Pure and deterministic, like {@link ReceivableAging} — given the same rows it returns the same
 * sales, so the screen and its test can be argued about without a database.
 */
public final class CostReplay
{
    /** A rupee's worth of slack: below this, a figure is zero and a shelf is empty. */
    private static final double EPSILON = 0.005;

    private CostReplay()
    {
    }

    /**
     * One sale line, priced. {@code cost} is what those goods stood the shop in; {@code costed}
     * says whether that is a figure or a placeholder — when it is false the cost is zero because
     * nothing is known, not because the goods were free.
     */
    public record Sale(
            LocalDate date,
            String itemId,
            String itemName,
            String unit,
            double quantity,
            double revenue,
            double cost,
            boolean costed
    )
    {
        public double profit()
        {
            return revenue - cost;
        }
    }

    /**
     * Every sale in {@code from..to}, priced at the weighted average its item stood at on the day.
     *
     * <p>{@code history} must be the store's whole STOCK history up to {@code to}, oldest first —
     * not the window. The average a sale meets is the sum of everything bought before it, so
     * starting the walk at {@code from} would price the window's first bills off an empty shelf.
     * The far end is cut because nothing bought after a sale can change what that sale cost.
     */
    public static List<Sale> priceSales(List<StockLedgerRow> history, LocalDate from, LocalDate to)
    {
        Map<String, Double> discountShare = discountShares(history);
        Map<String, Pool> pools = new HashMap<>();
        List<Sale> sales = new ArrayList<>();

        for (StockLedgerRow row : history)
        {
            // A PROCESSING entry's raw-material rows name cloth that is not in the catalogue
            // (see V5__processing.sql), so they have no item and no pool to move.
            if (row.itemId() == null)
            {
                continue;
            }
            double quantity = row.quantity() == null ? 0 : row.quantity().doubleValue();
            if (quantity <= EPSILON)
            {
                continue;
            }

            Pool pool = pools.computeIfAbsent(row.itemId(), id -> new Pool());
            double keep = 1 - discountShare.getOrDefault(row.transactionId(), 0.0);

            if (row.inOut() == InOut.IN)
            {
                Double unitCost = costOfGoodsIn(row, keep);
                if (unitCost == null)
                {
                    // Goods on the shelf that nobody can say the cost of. Left out of the pool
                    // rather than folded in at zero, which would drag the average of everything
                    // else down with it; the flag is what makes the sales behind it say so.
                    pool.known = false;
                }
                else
                {
                    pool.take(quantity, unitCost);
                }
                continue;
            }

            if (row.event() == TransactionEvent.SALE)
            {
                double rate = row.itemSoldAt() == null ? 0 : row.itemSoldAt();
                if (!row.businessDate().isBefore(from) && !row.businessDate().isAfter(to))
                {
                    sales.add(new Sale(
                            row.businessDate(),
                            row.itemId(),
                            row.itemName(),
                            row.unit(),
                            quantity,
                            quantity * rate * keep,
                            pool.known ? quantity * pool.average : 0,
                            pool.known
                    ));
                }
            }
            pool.give(quantity);
        }
        return sales;
    }

    /**
     * What one unit of an incoming line cost, or null when nothing says.
     *
     * <p>A purchase or a job-work output carries its rate. An opening count carries none — the
     * shopkeeper typed what is on the shelf, not what they paid for it — so the item's own cost
     * price stands in, and an item that has neither is simply unknown.
     */
    private static Double costOfGoodsIn(StockLedgerRow row, double keep)
    {
        if (row.itemSoldAt() != null && row.itemSoldAt() > EPSILON)
        {
            return row.itemSoldAt() * keep;
        }
        if (row.costPrice() != null && row.costPrice().doubleValue() > EPSILON)
        {
            return row.costPrice().doubleValue();
        }
        return null;
    }

    /**
     * How much of each bill was knocked off it, as a fraction of its goods — the share every line
     * on that bill gives up.
     *
     * <p>Spread by value rather than evenly across lines: a 500 discount on a bill of one 5,000
     * line and one 500 line came off the big line, in the shopkeeper's head and in the total they
     * agreed to. Capped at the whole, since a discount larger than the goods (data entry, or a bill
     * that is all discount) would otherwise price the line negative.
     */
    private static Map<String, Double> discountShares(List<StockLedgerRow> history)
    {
        Map<String, Double> goods = new HashMap<>();
        Map<String, Double> discounts = new HashMap<>();
        for (StockLedgerRow row : history)
        {
            if (row.discount() == null || row.discount() <= EPSILON)
            {
                continue;
            }
            double quantity = row.quantity() == null ? 0 : row.quantity().doubleValue();
            double rate = row.itemSoldAt() == null ? 0 : row.itemSoldAt();
            goods.merge(row.transactionId(), quantity * rate, Double::sum);
            discounts.put(row.transactionId(), row.discount());
        }

        Map<String, Double> shares = new HashMap<>();
        discounts.forEach((transactionId, discount) -> {
            double total = goods.getOrDefault(transactionId, 0.0);
            if (total > EPSILON)
            {
                shares.put(transactionId, Math.min(1.0, discount / total));
            }
        });
        return shares;
    }

    /** One item's shelf: how much is on it, what it is carried at, and whether that is known. */
    private static final class Pool
    {
        private double quantity;
        private double value;
        private double average;
        /** False once goods arrived that nothing prices — every sale after that is uncosted. */
        private boolean known;

        void take(double q, double unitCost)
        {
            quantity += q;
            value += q * unitCost;
            average = quantity > EPSILON ? value / quantity : unitCost;
            known = true;
        }

        void give(double q)
        {
            quantity -= q;
            value -= q * average;
            if (quantity <= EPSILON)
            {
                // Oversold, or sold down to nothing. The shelf is empty either way; the average
                // stays behind so the next purchase weighs against a rate rather than against
                // whatever a negative balance would have made of it.
                quantity = 0;
                value = 0;
            }
        }
    }
}
