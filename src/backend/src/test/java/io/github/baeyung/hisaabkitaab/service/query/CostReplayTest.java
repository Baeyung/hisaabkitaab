package io.github.baeyung.hisaabkitaab.service.query;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import io.github.baeyung.hisaabkitaab.service.query.support.CostReplay;
import io.github.baeyung.hisaabkitaab.service.query.support.CostReplay.Sale;
import io.github.baeyung.hisaabkitaab.service.query.support.StockLedgerRow;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * No cost is written down when a bill is made, so profit is only ever as good as this walk.
 * Each case here is one decision the walk makes about a shopkeeper's money — which rate a sale
 * meets, where a discount lands, what happens when nothing prices the goods — pinned so it cannot
 * quietly change direction.
 */
class CostReplayTest
{
    private static final LocalDate DAY_1 = LocalDate.of(2026, 8, 1);
    private static final double TOLERANCE = 0.01;

    private final List<StockLedgerRow> ledger = new ArrayList<>();
    private int entry;

    @Test
    void pricesEachSaleAtTheAverageStandingThatDay()
    {
        buy(DAY_1, 10, 100);
        sell(DAY_1.plusDays(1), 5, 150);
        buy(DAY_1.plusDays(2), 10, 140); // 5 left at 100 + 10 at 140 = 15 at 126.67
        sell(DAY_1.plusDays(3), 5, 150);

        List<Sale> sales = replay(DAY_1, DAY_1.plusDays(3));

        assertEquals(2, sales.size());
        assertEquals(500, sales.get(0).cost(), TOLERANCE);
        assertEquals(633.33, sales.get(1).cost(), TOLERANCE);
    }

    @Test
    void spreadsABillsDiscountAcrossItsLinesProRata()
    {
        buy(DAY_1, 40, 100);
        // One bill, two lines: 10 at 100 and 30 at 100 = 4000 of goods, 400 off = 10% each.
        String bill = nextEntry();
        sell(DAY_1.plusDays(1), 10, 100, bill, 400);
        sell(DAY_1.plusDays(1), 30, 100, bill, 400);

        List<Sale> sales = replay(DAY_1, DAY_1.plusDays(1));

        assertEquals(900, sales.get(0).revenue(), TOLERANCE);
        assertEquals(2700, sales.get(1).revenue(), TOLERANCE);
    }

    @Test
    void foldsAPurchaseDiscountIntoTheAverage()
    {
        // 100 at 50 is 5000 of goods, 500 off — the shelf carries them at 45, not 50.
        buy(DAY_1, 100, 50, nextEntry(), 500);
        sell(DAY_1.plusDays(1), 10, 80);

        assertEquals(450, replay(DAY_1, DAY_1.plusDays(1)).getFirst().cost(), TOLERANCE);
    }

    @Test
    void reportsASaleWithNoCostBehindItAsUncosted()
    {
        openingStock(DAY_1, 20, null); // counted onto the shelf, never priced
        sell(DAY_1.plusDays(1), 5, 150);

        Sale sale = replay(DAY_1, DAY_1.plusDays(1)).getFirst();

        assertFalse(sale.costed());
        assertEquals(0, sale.cost(), TOLERANCE);
        assertEquals(750, sale.revenue(), TOLERANCE);
    }

    @Test
    void pricesOpeningStockAtTheItemsCostPrice()
    {
        openingStock(DAY_1, 20, BigDecimal.valueOf(90));
        sell(DAY_1.plusDays(1), 5, 150);

        Sale sale = replay(DAY_1, DAY_1.plusDays(1)).getFirst();

        assertTrue(sale.costed());
        assertEquals(450, sale.cost(), TOLERANCE);
    }

    @Test
    void keepsTheLastAverageWhenStockGoesNegative()
    {
        buy(DAY_1, 5, 100);
        sell(DAY_1.plusDays(1), 8, 150); // oversold: the books say three of these were never bought
        buy(DAY_1.plusDays(2), 5, 100);
        sell(DAY_1.plusDays(3), 5, 150);

        List<Sale> sales = replay(DAY_1, DAY_1.plusDays(3));

        assertEquals(800, sales.get(0).cost(), TOLERANCE);
        // The shelf was empty, not owing 300 of stock — the next lot is carried at what it cost.
        assertEquals(500, sales.get(1).cost(), TOLERANCE);
    }

    @Test
    void takesProcessingConsumptionWithoutBookingAProfit()
    {
        buy(DAY_1, 20, 100);
        consumeForProcessing(DAY_1.plusDays(1), 10);
        sell(DAY_1.plusDays(2), 10, 150);

        List<Sale> sales = replay(DAY_1, DAY_1.plusDays(2));

        assertEquals(1, sales.size(), "job work is not a sale");
        assertEquals(1000, sales.getFirst().cost(), TOLERANCE);
    }

    @Test
    void walksHistoryBeforeTheWindowButOnlyReportsInsideIt()
    {
        buy(DAY_1, 10, 100);
        sell(DAY_1.plusDays(1), 5, 150);
        sell(DAY_1.plusDays(10), 5, 150);

        List<Sale> sales = replay(DAY_1.plusDays(9), DAY_1.plusDays(11));

        assertEquals(1, sales.size());
        // Priced off a purchase nine days before the window opened, which is the whole point.
        assertEquals(500, sales.getFirst().cost(), TOLERANCE);
    }

    // ── Ledger builders: entries in the order the shop made them ──────────────

    private List<Sale> replay(LocalDate from, LocalDate to)
    {
        return CostReplay.priceSales(ledger, from, to);
    }

    private String nextEntry()
    {
        return "t" + (++entry);
    }

    private void buy(LocalDate date, double quantity, double rate)
    {
        buy(date, quantity, rate, nextEntry(), 0);
    }

    private void buy(LocalDate date, double quantity, double rate, String transactionId, double discount)
    {
        row(date, InOut.IN, quantity, rate, TransactionEvent.PURCHASE, transactionId, discount, null);
    }

    private void sell(LocalDate date, double quantity, double rate)
    {
        sell(date, quantity, rate, nextEntry(), 0);
    }

    private void sell(LocalDate date, double quantity, double rate, String transactionId, double discount)
    {
        row(date, InOut.OUT, quantity, rate, TransactionEvent.SALE, transactionId, discount, null);
    }

    private void openingStock(LocalDate date, double quantity, BigDecimal costPrice)
    {
        row(date, InOut.IN, quantity, null, TransactionEvent.OPENING_STOCK, nextEntry(), 0, costPrice);
    }

    private void consumeForProcessing(LocalDate date, double quantity)
    {
        row(date, InOut.OUT, quantity, null, TransactionEvent.PROCESSING, nextEntry(), 0, null);
    }

    private void row(
            LocalDate date,
            InOut inOut,
            double quantity,
            Double rate,
            TransactionEvent event,
            String transactionId,
            double discount,
            BigDecimal costPrice
    )
    {
        ledger.add(new StockLedgerRow(
                "i1",
                "Lawn",
                "gz",
                inOut,
                BigDecimal.valueOf(quantity),
                rate,
                date,
                event,
                transactionId,
                discount,
                costPrice
        ));
    }
}
