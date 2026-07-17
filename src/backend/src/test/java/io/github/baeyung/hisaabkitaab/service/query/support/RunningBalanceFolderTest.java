package io.github.baeyung.hisaabkitaab.service.query.support;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RunningBalanceFolderTest
{
    @Test
    void foldsSignedDeltasFromOpeningAndHandsEachRowItsRunningTotal()
    {
        List<Double> rows = RunningBalanceFolder.fold(
                List.of(500.0, -200.0, 100.0),
                1000.0,
                delta -> delta,
                (delta, running) -> running
        );

        assertEquals(List.of(1500.0, 1300.0, 1400.0), rows);
    }

    @Test
    void emptyListYieldsNoRows()
    {
        List<Double> rows = RunningBalanceFolder.fold(
                List.<Double>of(),
                42.0,
                delta -> delta,
                (delta, running) -> running
        );

        assertEquals(List.of(), rows);
    }
}
