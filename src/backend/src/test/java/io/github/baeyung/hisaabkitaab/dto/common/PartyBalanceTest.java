package io.github.baeyung.hisaabkitaab.dto.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PartyBalanceTest
{
    @Test
    void positiveNetMeansTheyOweYou()
    {
        PartyBalance balance = PartyBalance.of(1500.0);

        assertEquals(BalanceDirection.THEY_OWE_YOU, balance.direction());
        assertEquals(1500.0, balance.amount());
    }

    @Test
    void negativeNetMeansYouOweThemWithAmountFlippedPositive()
    {
        PartyBalance balance = PartyBalance.of(-2000.0);

        assertEquals(BalanceDirection.YOU_OWE_THEM, balance.direction());
        assertEquals(2000.0, balance.amount());
    }

    @Test
    void nearZeroNetIsSettled()
    {
        PartyBalance balance = PartyBalance.of(0.004);

        assertEquals(BalanceDirection.SETTLED, balance.direction());
        assertEquals(0.0, balance.amount());
    }
}
