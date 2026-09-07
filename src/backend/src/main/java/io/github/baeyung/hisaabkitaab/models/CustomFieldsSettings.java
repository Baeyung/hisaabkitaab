package io.github.baeyung.hisaabkitaab.models;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

/**
 * How one shop has arranged the columns of its sale and purchase grids. Part of
 * {@link StoreSettings}, and as opaque to this side as the menu is: the ids are the client's,
 * the formulas are parsed by the screen that wrote them, and what "gazana" means is not a
 * question this side can answer. All it does is cap the sizes.
 *
 * <p><strong>Null is the whole default.</strong> A shop that has never opened the Custom
 * Fields screen has no value here, and its entry grid is the one the app ships with — item,
 * quantity, unit, rate, amount — down to the unit conversion slip. That is what keeps this
 * feature invisible to every shop that did not ask for it.
 *
 * <p>One set for both the sale and the purchase screen, because a shop that buys cloth in
 * thans and gazana sells it the same way. A shop that ever needs them to differ gets an
 * optional {@code purchaseFields} beside {@code fields}, absent meaning "the same", exactly
 * as {@code easyMenu} was added beside {@code menu}.
 *
 * @param fields    the grid's columns in the order they appear, after the item box. Capped at
 *                  a number that can still be read across a counter on a phone.
 * @param showUnit  whether the unit box is on the grid. It carries the whole unit-conversion
 *                  apparatus with it: off means no box, no slip, no factor and no rate
 *                  rescaling, and a quantity that goes to the shelf in the catalogue item's
 *                  own unit. A shop that finds the slip a hassle switches it off here.
 * @param total     how a line's amount is worked out — {@code thans * gazana * rate}. The
 *                  amount column itself is built in and always last, so it is a formula here
 *                  rather than one more entry in {@code fields}.
 * @param shelfQty  how much stock the line moves. The one number this arrangement owes the
 *                  rest of the app: it becomes {@code TransactionLine.quantity}, and the rate
 *                  stored beside it is {@code total ÷ shelfQty}, so that quantity × rate is
 *                  exactly the total above and every read of the bill agrees with the screen
 *                  that wrote it.
 * @param rateField which column the catalogue's price prefills into, and which one the
 *                  conversion slip rescales when a line is written in another unit. Null for
 *                  an arrangement where neither applies — the shop simply gets no prefill.
 */
public record CustomFieldsSettings(
        @Size(max = 12) List<@Valid CustomField> fields,
        boolean showUnit,
        @Size(max = 200) String total,
        @Size(max = 200) String shelfQty,
        @Size(max = 64) String rateField)
{
    /** Null-safe by construction, mirroring {@link StoreSettings}. */
    public CustomFieldsSettings
    {
        fields = fields == null ? List.of() : List.copyOf(fields);
    }
}
