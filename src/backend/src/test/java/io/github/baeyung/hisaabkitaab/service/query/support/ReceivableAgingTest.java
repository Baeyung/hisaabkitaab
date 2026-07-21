package io.github.baeyung.hisaabkitaab.service.query.support;

import java.util.List;
import java.util.OptionalLong;

import org.junit.jupiter.api.Test;

import io.github.baeyung.hisaabkitaab.service.query.support.ReceivableAging.Movement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReceivableAgingTest
{
    private static Movement charge(long day, double amount)
    {
        return new Movement(day, amount, 0);
    }

    private static Movement payment(long day, double amount)
    {
        return new Movement(day, 0, amount);
    }

    @Test
    void partiallyPaidBalanceAgesFromTheOldestUnsettledCharge()
    {
        // Owed 100 on day 10 and 50 on day 30, then paid 100 — the day-10 charge
        // is cleared, so the oldest still-unpaid is the day-30 one.
        OptionalLong oldest = ReceivableAging.oldestUnpaidEpochDay(List.of(
                charge(10, 100),
                charge(30, 50),
                payment(40, 100)
        ));

        assertTrue(oldest.isPresent());
        assertEquals(30, oldest.getAsLong());
    }

    @Test
    void olderChargeStillPartlyUnpaidKeepsAgingFromIt()
    {
        // Paid only 40 of the day-10 charge; 60 of it is still owed, so aging
        // stays anchored to day 10 even though a later charge exists.
        OptionalLong oldest = ReceivableAging.oldestUnpaidEpochDay(List.of(
                charge(10, 100),
                payment(20, 40),
                charge(30, 50)
        ));

        assertEquals(10, oldest.getAsLong());
    }

    @Test
    void fullySettledPartyHasNothingOutstanding()
    {
        OptionalLong oldest = ReceivableAging.oldestUnpaidEpochDay(List.of(
                charge(10, 100),
                payment(20, 100)
        ));

        assertFalse(oldest.isPresent());
    }

    @Test
    void overpaymentLeavesNothingOutstanding()
    {
        OptionalLong oldest = ReceivableAging.oldestUnpaidEpochDay(List.of(
                charge(10, 100),
                payment(20, 150)
        ));

        assertFalse(oldest.isPresent());
    }

    @Test
    void chargeRemainingClearsOldestBillFirst()
    {
        // Two 5000 bills, party has paid 7000 — the first bill is fully covered
        // (green), the second still owes 3000.
        double[] remaining = ReceivableAging.chargeRemaining(List.of(
                charge(10, 5000),
                charge(20, 5000),
                payment(30, 7000)
        ));

        assertEquals(2, remaining.length);
        assertEquals(0, remaining[0], 0.005);
        assertEquals(3000, remaining[1], 0.005);
    }

    @Test
    void chargeRemainingLeavesEverythingOwedWhenNothingPaid()
    {
        double[] remaining = ReceivableAging.chargeRemaining(List.of(
                charge(10, 5000),
                charge(20, 5000)
        ));

        assertEquals(5000, remaining[0], 0.005);
        assertEquals(5000, remaining[1], 0.005);
    }
}
