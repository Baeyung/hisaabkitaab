package io.github.baeyung.hisaabkitaab.dto.store;

import io.github.baeyung.hisaabkitaab.dto.dashboard.DashboardResponse;

/**
 * One shop's dashboard, carried alongside the shop it belongs to, for the side-by-side
 * comparison screen an owner with several shops lands on.
 *
 * <p>Deliberately the <em>whole</em> {@link DashboardResponse} rather than a trimmed
 * "comparison" projection: the numbers are already computed by the same call the single-shop
 * dashboard makes, so a narrower record would only mean a second shape to keep in step with it
 * every time a widget is added.
 */
public record StoreComparison(StoreSummary store, DashboardResponse dashboard)
{
}
