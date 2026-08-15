package io.github.baeyung.hisaabkitaab.models;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import io.github.baeyung.hisaabkitaab.enums.ChromeItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/**
 * How one shop's owner has arranged the app for everyone working in it. Stored as JSON in
 * {@code stores.settings} by {@code StoreSettingsConverter}, and sent to the client on every
 * {@code StoreSummary} so the menu can be drawn right the first time.
 *
 * <p><strong>The backend does not know what any of this means.</strong> It caps how much of it
 * there can be and validates nothing else — the menu keys are the client's, and only the
 * client knows whether {@code nav.ledger} is still a screen. Reconciling a saved arrangement
 * against the menu the running app actually has is {@code applyMenu()}'s job in
 * {@code layout/shell/nav.ts}. Keeping that judgement in one place is what lets a screen be
 * added, renamed or dropped without a migration.
 *
 * @param menu       the top-level menu in the order it should appear. Not authoritative:
 *                   entries the client no longer recognises are dropped and menu items
 *                   missing from it are appended, so an arrangement saved today still shows
 *                   next month's new screen.
 * @param hideChrome the sidebar-foot controls this shop has switched off. Empty means all of
 *                   them are shown, which is what a shop that has never been arranged gets.
 * @param easyMode   whether this shop navigates from the board — one screen of big buttons
 *                   instead of the sidebar. Lives here rather than on the user because it is
 *                   the shop's own way of working: the counter tablet everybody shares is
 *                   what it is for. Presentation only, like everything else here — every
 *                   route stays exactly as reachable, and the board is built from the same
 *                   arranged {@code menu} above, so hiding an entry hides its button too.
 */
public record StoreSettings(
        @Size(max = 64) List<@Valid MenuSetting> menu,
        Set<ChromeItem> hideChrome,
        boolean easyMode)
{
    /** What a shop with a null {@code settings} column means: the built-in menu, nothing hidden. */
    public static final StoreSettings EMPTY = new StoreSettings(List.of(), EnumSet.noneOf(ChromeItem.class), false);

    /**
     * Null-safe by construction, so nothing downstream — the converter, the client, a future
     * caller — has to ask whether half of a stored document was present.
     */
    public StoreSettings
    {
        menu = menu == null ? List.of() : List.copyOf(menu);
        hideChrome = hideChrome == null ? EnumSet.noneOf(ChromeItem.class) : Set.copyOf(hideChrome);
    }
}
