import { Formula, evaluate, evaluationOrder, parseFormula } from './formula';

/**
 * One column a shop has added to its sale and purchase grids. Mirrors the backend
 * `CustomField`.
 */
export interface CustomField {
  /**
   * The column's stable name — what its formulas call it, and the key its value is stored
   * under on every line. Slugged from the label once, when the column is made, and never
   * again: that is what lets a shop rename a column without orphaning the bills that already
   * recorded values under the old name.
   */
  id: string;
  /** What this shop calls the column. One string for both languages, like `MenuSetting.label`. */
  label: string;
  /** How it is worked out, or absent for a column the shopkeeper types into. */
  formula?: string;
  /** Whether the printed bill adds this column up across its lines — 15 thans on a 10 + 5 bill. */
  showTotal?: boolean;
}

/**
 * How a shop has arranged the columns of its sale and purchase grids. Mirrors the backend
 * `CustomFieldsSettings`, and lives in the same `stores.settings` document as the menu.
 *
 * Absent on a store means the grid the app ships with — see {@link DEFAULT_CUSTOM_FIELDS},
 * which is that grid written out as one of these. Every screen goes through this shape, so
 * there is one code path and not a "custom" one beside a "normal" one; a shop that has never
 * opened the settings screen simply runs the default arrangement.
 */
export interface CustomFieldsSettings {
  /** The grid's columns in order, after the item box and before the amount. */
  fields: CustomField[];
  /**
   * Whether the unit box is on the grid — and with it the whole conversion apparatus. Off
   * means no box, no slip, no factor and no rate rescaling, and a quantity that goes to the
   * shelf in the catalogue item's own unit.
   */
  showUnit: boolean;
  /** How the line's amount is worked out. The amount column is built in and always last. */
  total: string;
  /**
   * How much stock the line moves. The one number this arrangement owes the rest of the app:
   * it becomes the line's `quantity`, and the rate stored beside it is `total ÷ shelfQty`, so
   * that quantity × rate is exactly the total the grid showed. Everything that reads a saved
   * bill recomputes it that way (`DocumentTotals.goods()`), which is why the two must agree.
   */
  shelfQty: string;
  /**
   * Which column the catalogue's price prefills into, and which one the conversion slip
   * rescales when a line is written in another unit. Absent for an arrangement where neither
   * applies — the shop gets no prefill and no rescale, which is coherent, just less helpful.
   */
  rateField?: string;
}

/** The two columns every shop starts with, and the ids the stored values fall back to. */
export const DEFAULT_QTY_FIELD = 'qty';
export const DEFAULT_RATE_FIELD = 'rate';

/**
 * The grid the app ships with, written as an arrangement: item, quantity, unit, rate, amount,
 * with the conversion slip on. Every shop that has never opened the Custom Fields screen runs
 * exactly this, through exactly the same code as a shop that has — which is what keeps the
 * feature invisible to the shops that did not ask for it.
 */
export const DEFAULT_CUSTOM_FIELDS: CustomFieldsSettings = {
  fields: [
    { id: DEFAULT_QTY_FIELD, label: '' },
    { id: DEFAULT_RATE_FIELD, label: '' },
  ],
  showUnit: true,
  total: `${DEFAULT_QTY_FIELD} * ${DEFAULT_RATE_FIELD}`,
  shelfQty: DEFAULT_QTY_FIELD,
  rateField: DEFAULT_RATE_FIELD,
};

/**
 * An arrangement with every formula parsed once, ready for the grid to evaluate on each
 * keystroke without re-reading the text.
 *
 * Parsing can fail — a formula is only checked when it is saved, and a document could have
 * been written by an older or a newer build. A failure here falls back to the built-in
 * arrangement rather than leaving the entry screen with no columns at all, on the same
 * reasoning as `StoreSettingsConverter` returning null on an unreadable row: the shop keeps
 * working, and its owner can put the arrangement right.
 */
export interface CompiledArrangement {
  settings: CustomFieldsSettings;
  /** The columns the shopkeeper types into, in grid order. */
  typed: CustomField[];
  /** Computed columns in the order they must be worked out. */
  computed: { field: CustomField; formula: Formula }[];
  total: Formula;
  shelfQty: Formula;
  /**
   * The single typed column the shelf quantity is, when it is just one — `qty` on the built-in
   * grid. Null when the shelf figure is worked out from several (`thans * gazana`).
   */
  shelfField: string | null;
  /**
   * Whether a line in this arrangement can be written in a unit other than the item's.
   *
   * Conversion has to survive a bill being reopened, and the only way it can is if the stored
   * line can be written as though it had been entered in the shelf's own unit: the shelf
   * column multiplied by the factor, the rate column divided by it, leaving the total
   * untouched. That needs exactly one column to scale and exactly one to unscale — so an
   * arrangement whose shelf figure is a product of columns cannot offer the unit box, and the
   * settings screen will not let one be switched on.
   *
   * The built-in grid satisfies this by construction (`qty` and `rate`), which is why nothing
   * about conversion changes for a shop that has never arranged its own columns.
   */
  convertible: boolean;
  /** True when this is {@link DEFAULT_CUSTOM_FIELDS}, so labels come from the dictionary. */
  isDefault: boolean;
}

export function compileArrangement(
  settings: CustomFieldsSettings | null | undefined,
): CompiledArrangement {
  const source = settings ?? DEFAULT_CUSTOM_FIELDS;
  try {
    return compile(source);
  } catch {
    // Unreadable arrangement: the shop falls back to the grid it would have had anyway.
    return compile(DEFAULT_CUSTOM_FIELDS);
  }
}

function compile(settings: CustomFieldsSettings): CompiledArrangement {
  const ids = settings.fields.map((f) => f.id);
  const parsed = new Map(
    settings.fields
      .filter((f) => f.formula?.trim())
      .map((f) => [f.id, parseFormula(f.formula!, ids)] as const),
  );

  const order = evaluationOrder(
    settings.fields.map((f) => ({ id: f.id, formula: parsed.get(f.id) ?? null })),
  );
  const byId = new Map(settings.fields.map((f) => [f.id, f]));

  const shelfQty = parseFormula(settings.shelfQty, ids);
  const shelfField = soleTypedRef(shelfQty, parsed);
  const rateField = settings.rateField;

  return {
    settings,
    typed: settings.fields.filter((f) => !parsed.has(f.id)),
    computed: order.map((id) => ({ field: byId.get(id)!, formula: parsed.get(id)! })),
    total: parseFormula(settings.total, ids),
    shelfQty,
    shelfField,
    convertible:
      shelfField != null &&
      !!rateField &&
      rateField !== shelfField &&
      byId.has(rateField) &&
      !parsed.has(rateField),
    isDefault: settings === DEFAULT_CUSTOM_FIELDS,
  };
}

/**
 * The one column a formula is, when it is nothing but that column — `qty`, not `thans *
 * gazana`. A computed column does not count: scaling one would mean scaling whatever feeds it,
 * which is the ambiguity this whole check exists to refuse.
 */
function soleTypedRef(formula: Formula, computed: ReadonlyMap<string, Formula>): string | null {
  if (formula.rpn.length !== 1 || formula.rpn[0].kind !== 'ref') {
    return null;
  }
  const id = formula.rpn[0].name;
  return computed.has(id) ? null : id;
}

/**
 * Fill in a line's computed columns from what has been typed into it, then hand back every
 * column's value. Runs in dependency order, so a column reading another computed one sees the
 * worked-out figure rather than a blank.
 */
export function resolveValues(
  arrangement: CompiledArrangement,
  typed: Readonly<Record<string, number | null>>,
): Record<string, number | null> {
  const values: Record<string, number | null> = { ...typed };
  for (const { field, formula } of arrangement.computed) {
    values[field.id] = evaluate(formula, values);
  }
  return values;
}

/**
 * What a saved line recorded, for a bill that is being read back rather than written.
 *
 * A null means the line was written before this shop had columns of its own — or before the
 * column existed at all — so it reads as the two the app has always had, taken from the
 * quantity and rate stored beside it. The backend deliberately does not fill this in: the
 * default ids are this side's vocabulary, the same way `nav.ledger` is.
 */
export function storedValues(
  customFields: Readonly<Record<string, number>> | null | undefined,
  quantity: number | null,
  rate: number | null,
): Record<string, number | null> {
  if (customFields && Object.keys(customFields).length > 0) {
    return { ...customFields };
  }
  return { [DEFAULT_QTY_FIELD]: quantity, [DEFAULT_RATE_FIELD]: rate };
}
