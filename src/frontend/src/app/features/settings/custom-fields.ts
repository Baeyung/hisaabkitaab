import { Component, computed, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { StoreSettings } from '../../core/store/store.models';
import { ToastService } from '../../shared/toast/toast.service';
import {
  CustomField,
  CustomFieldsSettings,
  DEFAULT_CUSTOM_FIELDS,
  DEFAULT_QTY_FIELD,
  DEFAULT_RATE_FIELD,
  compileArrangement,
  resolveValues,
} from '../../core/store/custom-field.models';
import { FormulaError, evaluate, findCycles, parseFormula } from '../../core/store/formula';
import { CopyToStores, copyTargets } from './copy-to-stores';

/** A column as this screen holds it while it is being edited. */
interface Draft {
  /** Stable once created — see {@link CustomField.id}. Empty on a row that is still new. */
  id: string;
  label: string;
  formula: string;
  /** Whether the printed bill foots this column — see {@link CustomField.showTotal}. */
  showTotal: boolean;
  /** Set once the column has been saved at least once, so its id is no longer up for grabs. */
  fixed: boolean;
}

/** What is wrong with the arrangement, if anything — one message, the first thing to fix. */
interface Problem {
  key: TranslationKey;
  params?: Record<string, string>;
}

/** One cell of the previewed line: a column of the shop's, or the unit box beside it. */
type PreviewCell =
  | { kind: 'field'; id: string; label: string; typed: boolean }
  | { kind: 'unit' };

/**
 * Store Settings › Custom Fields — what a shop asks for on each line of a sale or a purchase.
 *
 * The grid the app ships with is item · quantity · unit · rate · amount, and that is what
 * every shop has until someone opens this screen. A shop that counts cloth differently says
 * so here: name the columns, say how the amount is worked out (`thans * gazana * rate`), say
 * which of them is the quantity that comes off the shelf, and the entry screen is that shape
 * from then on.
 *
 * <p>Two rules are load-bearing and are enforced before anything is saved, because both would
 * otherwise show up as a wrong number on a bill rather than as an error:
 *
 * <ul>
 *   <li><strong>Every formula has to parse and none may be circular.</strong> Checked here,
 *       once, so the entry screen — which evaluates on every keystroke — only ever sees
 *       formulas that are already known to be good.
 *   <li><strong>The shelf quantity has to be a real quantity.</strong> It becomes the line's
 *       stored quantity, and the rate stored beside it is the amount divided by it, so that
 *       quantity × rate is exactly the total the shopkeeper agreed to. Everything that reads
 *       a saved bill recomputes the total that way.
 * </ul>
 *
 * The unit box is offered only while the shelf quantity is a single typed column, because a
 * converted line has to be storable as though it had been entered in the shelf's own unit —
 * one column scaled up, one scaled down — and a shelf figure worked out from several columns
 * gives no unambiguous pair to scale. Switching the unit box off is the whole point for a
 * shop that finds the conversion slip a hassle; it takes the slip, the factor and the rate
 * rescaling with it.
 *
 * <p>None of the above is legible as a set of boxes, which is why the screen opens with one
 * row of the entry grid drawn from whatever is currently typed, with real inputs in it — see
 * {@link preview}. Columns, a total formula and a shelf formula only mean something once you
 * can see the line they make and put a figure through it.
 */
@Component({
  selector: 'app-settings-custom-fields',
  imports: [CopyToStores],
  templateUrl: './custom-fields.html',
  styleUrls: ['./settings-table.css', './settings-switch.css', './custom-fields.css'],
})
export class SettingsCustomFields {
  protected readonly locale = inject(LocaleService);
  private readonly stores = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly saving = signal(false);
  /** Set by the first save attempt, so problems appear then rather than while typing. */
  protected readonly attempted = signal(false);

  protected readonly rows = signal<Draft[]>([]);
  protected readonly totalFormula = signal('');
  protected readonly shelfFormula = signal('');
  protected readonly rateField = signal('');
  protected readonly showUnit = signal(true);

  /** Whether this shop is running its own columns at all, or the ones the app ships with. */
  protected readonly arranged = signal(false);

  /** The other shops this grid could be given to, and whether they are being asked. */
  protected readonly otherStores = computed(() => copyTargets(this.stores, true));
  protected readonly copyOpen = signal(false);

  constructor() {
    this.load();
  }

  private load(): void {
    const saved = this.stores.current()?.settings?.customFields;
    this.arranged.set(!!saved);
    const source = saved ?? DEFAULT_CUSTOM_FIELDS;
    this.rows.set(
      source.fields.map((f) => ({
        id: f.id,
        label: f.label || this.builtInLabel(f.id),
        formula: f.formula ?? '',
        showTotal: !!f.showTotal,
        fixed: true,
      })),
    );
    this.totalFormula.set(source.total);
    this.shelfFormula.set(source.shelfQty);
    this.rateField.set(source.rateField ?? '');
    this.showUnit.set(source.showUnit);
  }

  /**
   * What the built-in columns are called when they are first shown here. They carry no label
   * of their own — the grid names them from the dictionary — but this screen has to put
   * something in the box, and a shop editing them is naming them for the first time.
   */
  private builtInLabel(id: string): string {
    if (id === DEFAULT_QTY_FIELD) {
      return this.locale.t('sale.col.qty');
    }
    if (id === DEFAULT_RATE_FIELD) {
      return this.locale.t('sale.col.rate');
    }
    return id;
  }

  // ── the arrangement as it currently reads ─────────────────────────────

  /** Column ids in order, for the formula boxes to check against and for the chips. */
  protected readonly ids = computed(() => this.rows().map((r) => r.id).filter(Boolean));

  /** The columns a formula may name — the typed ones and the computed ones alike. */
  protected readonly chips = computed(() =>
    this.rows().filter((r) => r.id).map((r) => ({ id: r.id, label: r.label || r.id })),
  );

  /**
   * The columns that can be the rate — typed, not computed. A computed column cannot take the
   * catalogue's price, and the conversion slip cannot rescale one without rescaling whatever
   * feeds it.
   */
  protected readonly rateChoices = computed(() =>
    this.rows().filter((r) => r.id && !r.formula.trim()),
  );

  /**
   * Whether the unit box can be offered at all: the shelf quantity has to be one typed column
   * and there has to be a separate rate column to rescale against it. See the class comment.
   */
  protected readonly canShowUnit = computed(() => {
    const shelf = this.shelfFormula().trim();
    const rate = this.rateField();
    return (
      this.rateChoices().some((r) => r.id === shelf) &&
      !!rate &&
      rate !== shelf &&
      this.rateChoices().some((r) => r.id === rate)
    );
  });

  /**
   * The first thing wrong with the arrangement, or null when it is sound. One at a time and
   * in the order they have to be fixed: there is no use pointing at a broken total formula
   * while a column it names still has no name.
   */
  protected readonly problem = computed<Problem | null>(() => {
    const rows = this.rows();
    if (rows.length === 0) {
      return { key: 'settings.customFields.error.noColumns' };
    }
    if (rows.some((r) => !r.label.trim())) {
      return { key: 'settings.customFields.error.unnamed' };
    }

    const ids = this.ids();
    const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
    if (duplicate) {
      const row = rows.find((r) => r.id === duplicate);
      return { key: 'settings.customFields.error.duplicate', params: { name: row?.label ?? duplicate } };
    }

    for (const row of rows) {
      if (!row.formula.trim()) {
        continue;
      }
      const bad = this.formulaProblem(row.formula, ids, row.label);
      if (bad) {
        return bad;
      }
    }

    const cycle = findCycles(
      rows.map((r) => ({
        id: r.id,
        formula: r.formula.trim() ? this.tryParse(r.formula, ids) : null,
      })),
    );
    if (cycle.length > 0) {
      const row = rows.find((r) => r.id === cycle[0]);
      return { key: 'settings.customFields.error.cycle', params: { name: row?.label ?? cycle[0] } };
    }

    const total = this.formulaProblem(
      this.totalFormula(),
      ids,
      this.locale.t('settings.customFields.total'),
    );
    if (total) {
      return total;
    }
    const shelf = this.formulaProblem(
      this.shelfFormula(),
      ids,
      this.locale.t('settings.customFields.shelf'),
    );
    if (shelf) {
      return shelf;
    }
    return null;
  });

  // ── the line, as it will be ───────────────────────────────────────────

  /**
   * Figures put into the preview by hand. Only what has actually been typed lives here — a
   * column that has never been touched falls back to {@link sampleValue}, so adding, renaming
   * or removing a column needs no bookkeeping in this signal at all.
   */
  private readonly sample = signal<Record<string, number>>({});

  /** What the preview shows in a column's box: whatever was typed into it, or a stand-in. */
  protected sampleValue(id: string): number {
    return this.sample()[id] ?? (id === this.rateField() ? 100 : 2);
  }

  protected setSample(id: string, raw: string): void {
    const n = Number(raw);
    this.sample.update((s) => ({ ...s, [id]: Number.isFinite(n) ? n : 0 }));
  }

  /**
   * One line of the entry grid as this arrangement would draw it, worked out from the sample
   * figures — the answer to "what does any of this look like on a bill", which the boxes below
   * cannot give on their own.
   *
   * Null while the arrangement cannot be compiled, which is exactly when there is no honest
   * line to draw. {@link compileArrangement} answers that by falling back to the built-in grid
   * rather than throwing, so the check is whether it handed back the arrangement it was given:
   * anything else means it could not read this one.
   */
  protected readonly preview = computed(() => {
    const settings = this.toSettings();
    if (settings.fields.some((f) => !f.id)) {
      return null;
    }
    const arrangement = compileArrangement(settings);
    if (arrangement.settings !== settings) {
      return null;
    }

    const typed: Record<string, number | null> = {};
    for (const field of arrangement.typed) {
      typed[field.id] = this.sampleValue(field.id);
    }
    const values = resolveValues(arrangement, typed);

    // The unit box sits immediately after the column it measures, the same as on the grid
    // itself — see `GoodsEntry.cells`.
    const withUnit = settings.showUnit && arrangement.convertible;
    const cells = settings.fields.flatMap<PreviewCell>((field) => {
      const cell: PreviewCell = {
        kind: 'field',
        id: field.id,
        label: field.label || field.id,
        typed: !field.formula?.trim(),
      };
      return withUnit && field.id === arrangement.shelfField ? [cell, { kind: 'unit' }] : [cell];
    });

    return {
      cells,
      values,
      amount: evaluate(arrangement.total, values),
      shelf: evaluate(arrangement.shelfQty, values),
      // The item box, one track per cell, then the amount — the sale grid's track minus the
      // remove button, which the preview has nothing to remove. The item is narrower than the
      // 2fr it gets there: here it holds a sample name rather than a searchable catalogue box,
      // and the columns being configured are what this line is for looking at.
      track: `minmax(0, 1.5fr) ${cells.map(() => 'minmax(0, 0.9fr)').join(' ')} minmax(70px, 1.1fr)`,
    };
  });

  private tryParse(source: string, ids: readonly string[]) {
    try {
      return parseFormula(source, ids);
    } catch {
      return null;
    }
  }

  private formulaProblem(source: string, ids: readonly string[], where: string): Problem | null {
    try {
      parseFormula(source, ids);
      return null;
    } catch (e) {
      const key =
        e instanceof FormulaError && e.key === 'unknownField'
          ? 'settings.customFields.error.unknownField'
          : 'settings.customFields.error.badFormula';
      const at = e instanceof FormulaError ? (e.at ?? '') : '';
      return { key, params: { where, at } };
    }
  }

  // ── editing ───────────────────────────────────────────────────────────

  protected setLabel(index: number, label: string): void {
    this.rows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, label, id: r.fixed ? r.id : slug(label) } : r)),
    );
  }

  protected setFormula(index: number, formula: string): void {
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, formula } : r)));
  }

  protected setShowTotal(index: number, showTotal: boolean): void {
    this.rows.update((rows) => rows.map((r, i) => (i === index ? { ...r, showTotal } : r)));
  }

  protected addColumn(): void {
    this.rows.update((rows) => [
      ...rows,
      { id: '', label: '', formula: '', showTotal: false, fixed: false },
    ]);
  }

  protected removeColumn(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected move(index: number, by: number): void {
    const to = index + by;
    this.rows.update((rows) => {
      if (to < 0 || to >= rows.length) {
        return rows;
      }
      const next = [...rows];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  /**
   * Put a column's name into a formula box — so nobody has to know or type an id.
   *
   * A box that already ends in an operator or an open bracket is waiting for a name, so the
   * name is all it gets; anything else is a finished expression, and the only thing a shop
   * ever wants next to one of those is another factor.
   */
  protected insert(target: 'total' | 'shelf' | number, id: string): void {
    const add = (current: string) => {
      const at = current.trim();
      return !at || /[+\-*/(]$/.test(at) ? `${at}${at ? ' ' : ''}${id}` : `${at} * ${id}`;
    };
    if (target === 'total') {
      this.totalFormula.update(add);
    } else if (target === 'shelf') {
      this.shelfFormula.update(add);
    } else {
      this.setFormula(target, add(this.rows()[target].formula));
    }
  }

  /** Back to the grid the app ships with. Local until saved, like every other edit here. */
  protected reset(): void {
    this.arranged.set(false);
    this.rows.set(
      DEFAULT_CUSTOM_FIELDS.fields.map((f) => ({
        id: f.id,
        label: this.builtInLabel(f.id),
        formula: '',
        showTotal: false,
        fixed: true,
      })),
    );
    this.totalFormula.set(DEFAULT_CUSTOM_FIELDS.total);
    this.shelfFormula.set(DEFAULT_CUSTOM_FIELDS.shelfQty);
    this.rateField.set(DEFAULT_RATE_FIELD);
    this.showUnit.set(true);
    this.attempted.set(false);
  }

  /** Answers whether the arrangement went in, which is what {@link copyArrangement} waits on. */
  async save(): Promise<boolean> {
    this.attempted.set(true);
    if (this.problem()) {
      return false;
    }
    this.saving.set(true);
    try {
      const settings = this.stores.current()?.settings;
      // Spread rather than rebuild: this screen owns one field of the document and must not
      // be what resets a shop's menu, its board or its nightly report.
      await this.stores.updateSettings({
        ...(settings as StoreSettings),
        customFields: this.toSettings(),
      });
      this.arranged.set(true);
      this.rows.update((rows) => rows.map((r) => ({ ...r, fixed: true })));
      this.toast.success(this.locale.t('settings.customFields.saved'));
      return true;
    } catch {
      this.toast.error(this.locale.t('error.generic'));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Give the same grid to the shop's other branches: saved here first, then written into each
   * of them, so what is copied is exactly what this shop is now running rather than a
   * half-finished screen. A save that will not go through — a formula that does not parse, a
   * shelf quantity that is not one — stops the copy too, and reports the same problem Save
   * would have shown.
   *
   * The grid replaces whatever the target had, the built-in one included: "make my other
   * branches look like this" is the whole request, and a shop still on the shipped columns
   * copying them is a reset, deliberately asked for.
   *
   * An arrow rather than a method — it is handed to the panel as a value, so it has to carry
   * its own `this`.
   */
  protected readonly copyArrangement = async (ids: string[]): Promise<string[]> => {
    if (!(await this.save())) {
      return ids;
    }
    const arrangement = this.toSettings();
    return this.stores.copySettingsTo(ids, (target) => ({
      ...target,
      customFields: arrangement,
    }));
  };

  private toSettings(): CustomFieldsSettings {
    const fields: CustomField[] = this.rows().map((r) => ({
      id: r.id,
      label: r.label.trim(),
      formula: r.formula.trim() || undefined,
      showTotal: r.showTotal || undefined,
    }));
    return {
      fields,
      // Held to what the arrangement can actually support, so a shop that reshapes its
      // columns under a switched-on unit box does not save a state the grid would ignore.
      showUnit: this.showUnit() && this.canShowUnit(),
      total: this.totalFormula().trim(),
      shelfQty: this.shelfFormula().trim(),
      rateField: this.rateField() || undefined,
    };
  }
}

/**
 * A column's id, from what it was called when it was made. Narrower than the label on
 * purpose — a formula names columns, and `Total Gaz` has to be something a formula can say.
 * Leading digits and underscores are dropped so the result is always a name the parser reads,
 * and an unusable label (all punctuation, or Urdu, which has no ASCII to slug) falls back to
 * a positional one rather than to nothing.
 */
let slugSeq = 0;
function slug(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '');
  return base || `col${++slugSeq}`;
}
