package io.github.baeyung.hisaabkitaab.models;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * One entry in a shop's arranged menu. Part of {@link StoreSettings}; see that class for why
 * the backend treats the contents as opaque.
 *
 * @param key      which menu entry this is — the client's own translation key
 *                 ({@code nav.ledger}), which is already the stable id of every item in its
 *                 NAV table. Using it means renaming or reordering the menu needs no new ids
 *                 and no lookup table on either side.
 * @param hidden   whether to leave this entry out of the sidebar. Presentation only: the
 *                 route behind it stays reachable, exactly as with the role filtering it sits
 *                 beside. Hiding a screen is tidying a menu, never a permission — those are
 *                 {@code StoreRole} and the guards on the routes themselves.
 * @param label    what this shop calls the entry, or null/blank to keep the built-in name.
 *                 One string for both languages: a shop's own word for something is its own
 *                 word whichever language the app is in. Capped short because it has to fit
 *                 a sidebar row in two scripts.
 * @param tone     which way money moves through the entries under a band of the easy-mode
 *                 board — {@code in}, {@code out}, or {@code read} for everything else. Only
 *                 the board draws it and only on its middle level; null everywhere else,
 *                 including everywhere in the sidebar's document. Opaque here like the rest:
 *                 the client owns the vocabulary, this only caps its length.
 * @param children the group's sub-entries in order, for the entries that are groups. Null or
 *                 empty on a plain link. Nests up to three deep for the board — tab, band,
 *                 tile — and two for the sidebar; which is which is the client's judgement,
 *                 same as everything else in this record.
 */
public record MenuSetting(
        @NotBlank @Size(max = 64) String key,
        boolean hidden,
        @Size(max = 24) String label,
        @Size(max = 8) String tone,
        @Size(max = 32) List<@Valid MenuSetting> children)
{
    /** Null-safe by construction, mirroring {@link StoreSettings}. */
    public MenuSetting
    {
        children = children == null ? List.of() : List.copyOf(children);
    }
}
