package io.github.baeyung.hisaabkitaab.models;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * One column a shop has added to its sale and purchase grids. Part of
 * {@link CustomFieldsSettings}; see that record for why the backend treats the contents as
 * opaque.
 *
 * @param id      the stable name of the column, in the shop's formulas and as the key it is
 *                stored under on every line ({@code transaction_lines.custom_fields}).
 *                Slugged from the label once, when the column is created, and never again —
 *                which is what lets a shop rename a column without orphaning the bills that
 *                already recorded values under it. Capped to match the key length
 *                {@code CustomFieldValuesConverter} will accept.
 * @param label   what this shop calls the column. One string for both languages, and capped
 *                short for the same reason {@link MenuSetting#label()} is: it has to fit a
 *                grid heading in two scripts.
 * @param formula how the column is worked out, or null/blank for one the shopkeeper types
 *                into. Opaque here — an expression over other columns' {@code id}s, parsed
 *                and checked for cycles by the settings screen that wrote it, in the same
 *                way the menu keys are the client's to reconcile.
 * @param showTotal whether the printed bill adds this column up across its lines — a bill of
 *                10 thans and 5 thans footing "Total Thans 15". Presentation only, and false
 *                for every arrangement saved before it existed.
 */
public record CustomField(
        @NotBlank @Size(max = 64) String id,
        @Size(max = 24) String label,
        @Size(max = 200) String formula,
        boolean showTotal)
{
}
