package io.github.baeyung.hisaabkitaab.service.query.support;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.ToDoubleFunction;

/**
 * Folds a signed delta over an already-sorted list, handing each row its running
 * total — the shared shape of the cashbook day view and the khata statement.
 * (Inventory's running stock is BigDecimal and keeps its own three-line loop
 * rather than forcing double and BigDecimal through one generic seam.)
 */
public final class RunningBalanceFolder
{
    private RunningBalanceFolder()
    {
    }

    public static <T, R> List<R> fold(
            List<T> items,
            double opening,
            ToDoubleFunction<T> signedDelta,
            BiFunction<T, Double, R> rowMapper
    )
    {
        double running = opening;
        List<R> rows = new ArrayList<>(items.size());
        for (T item : items)
        {
            running += signedDelta.applyAsDouble(item);
            rows.add(rowMapper.apply(item, running));
        }
        return rows;
    }
}
