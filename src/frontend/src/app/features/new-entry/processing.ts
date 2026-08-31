import {
  Component,
  ElementRef,
  WritableSignal,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { StoreItemService } from '../../core/store/store-item.service';
import { PartyService } from '../../core/store/party.service';
import { ProcessingService } from '../../core/store/processing.service';
import { ProcessingInput } from '../../core/store/processing.models';
import { StoreItem } from '../../core/store/store-item.models';
import { Party } from '../../core/store/party.models';
import { todayIso } from '../../shared/date.util';
import { RecentLog } from '../../shared/recent-log';
import { ruleLines } from '../../shared/ruled-lines';
import { Combobox } from '../../shared/combobox/combobox';
import { DateField } from '../../shared/date-field/date-field';
import { UnitConversionService } from '../../core/units/unit-conversion.service';
import { ConversionSlipService } from '../../shared/conversion-slip/conversion-slip.service';
import { UnitNote } from '../../shared/conversion-slip/unit-note';
import { UnitService } from '../../core/units/unit.service';
import {
  UNIT_SUGGESTIONS,
  convertQty,
  resolveFactor,
  round2,
  sameUnit,
} from '../../core/units/units';

/**
 * One input row. `key` is a stable id for @for tracking.
 *
 * `party` empty means the row comes off the shelf; named, it was bought in for the batch —
 * `paid` is what was handed over for it, the rest staying on their khata.
 */
interface Line {
  key: number;
  name: string;
  unit: string;
  qty: number | null;
  rate: number | null;
  party: string;
  paid: number | null;
  /** Whether the supplier boxes are showing — a row is bought-in far less often than not. */
  open: boolean;
  /** Work rather than goods: costs the batch, bills the supplier, keeps no stock. */
  service: boolean;
  /**
   * The rate this row's unit was converted at, agreed in the slip — null when the row is
   * already in the unit its item is stocked in, which is nearly always. Multiplying by it is
   * what turns what was typed into what the shelf is told; see {@link Processing.toInput}.
   */
  factor: number | null;
  /**
   * The pair {@link factor} was agreed for, as `"gaz>meter"`. Kept because a row can change
   * underneath its own rate: retype the name, and the same "Gaz" in the unit box is suddenly
   * being measured against an item stocked in pieces. Comparing the pair is what notices.
   */
  factorFor: string | null;
}

/** How a converted pair is keyed on a row — folded, so case never makes it look like a new one. */
function pairKey(from: string, to: string): string {
  return `${from.trim().toLowerCase()}>${to.trim().toLowerCase()}`;
}

/**
 * PROCESSING entry — a batch of raw material and consumables turned into a different item.
 *
 * Three sides. **Raw material** (the greige cloth) and **processing items** (dyes, fuel) are
 * both real items that come off the shelf, autocompleting against the catalogue and created
 * when the name is new — the same way a sale or purchase line is. **The output** is one item
 * that goes onto the shelf, priced at what the batch cost to make.
 *
 * Any input row can name a **supplier**, for the common case of buying the cloth in for this
 * batch rather than taking it off the shelf. That posts an ordinary purchase of its own — one
 * per supplier, over all their rows — so the goods arrive, what was paid leaves the drawer,
 * the rest sits on their khata, and the batch then consumes what it just bought. A row with
 * no supplier simply comes off the shelf.
 *
 * A processing item can also be a **service** — the dyeing charge rather than the dye. That
 * marks the catalogue item as one, which the whole app already reads as "keeps no stock": the
 * row still costs the batch and still bills its supplier, it just holds no shelf quantity.
 *
 * The batch's price is the point of the screen:
 *
 * ```
 * cost/unit = (Σ raw qty × price + Σ processing qty × price) ÷ output units
 * ```
 *
 * shown live and editable — the shopkeeper can type over it. The backend then folds it into
 * the output item's cost price as a weighted average against what was already on hand, and
 * carries the sale price along at the margin the item already had (see `ProcessingService`).
 *
 * Wastage is recorded but costs nothing: it prefills to raw units − output units and goes
 * free once touched, the same "suggest until edited" rhythm the cash box uses on a sale.
 *
 * **Units.** A batch is where they diverge most: greige comes in by the metre and the dyed
 * cloth goes onto the shelf by the gaz. Stock is always kept in the unit the catalogue item
 * names, so a row entered in anything else is converted before it is posted — through the
 * conversion slip, which shows the sum and asks. What each row keeps afterwards is its
 * `factor`, and three things follow from it:
 *
 * - the quantity is multiplied by it on the way out ({@link toInput});
 * - the price is divided back out of it, derived from the row's amount rather than scaled, so
 *   a batch that reads Rs 12,000 on screen costs Rs 12,000 in the khata to the paisa;
 * - wastage compares like with like, which mixed units made impossible before.
 *
 * Edits are not offered: the repricing a batch does cannot be un-averaged, so correcting one
 * is delete + re-enter.
 */
@Component({
  selector: 'app-processing',
  templateUrl: './processing.html',
  styleUrls: ['./sale.css', './processing.css'],
  imports: [Combobox, DateField, UnitNote],
})
export class Processing {
  protected readonly locale = inject(LocaleService);
  private readonly itemApi = inject(StoreItemService);
  private readonly partyApi = inject(PartyService);
  private readonly api = inject(ProcessingService);
  private readonly conversions = inject(UnitConversionService);
  private readonly unitApi = inject(UnitService);
  private readonly slip = inject(ConversionSlipService);

  /** Offered under every unit box, so a trade unit is a choice and not a guess. */
  protected readonly unitOptions = signal<readonly string[]>(UNIT_SUGGESTIONS);

  /** Batch-number box — where the cursor goes after a Save + Next. */
  private readonly firstField = viewChild<ElementRef<HTMLInputElement>>('firstField');

  /** The chord printed on Save + Next; Enter belongs to the grids. See the sale screen. */
  protected readonly saveChord =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
      ? '⌘ ↵'
      : 'Ctrl ↵';

  // Declared before the line signals below, whose initializers call blankLine() → keySeq++.
  private keySeq = 1;

  /** Autocomplete source; empty when the item list 404s (no store yet). */
  protected readonly items = signal<StoreItem[]>([]);
  protected readonly itemNames = computed(() => this.items().map((i) => i.name));

  /** Party autocomplete; a name that matches nothing is created on save, as elsewhere. */
  protected readonly parties = signal<Party[]>([]);
  protected readonly partyNames = computed(() => this.parties().map((p) => p.name));

  protected readonly billNumber = signal('');
  protected readonly billDate = signal(todayIso());
  protected readonly description = signal('');

  protected readonly rawLines = signal<Line[]>([this.blankLine()]);
  protected readonly procLines = signal<Line[]>([this.blankLine()]);

  protected readonly typedOutputName = signal('');
  protected readonly outputNameTouched = signal(false);
  protected readonly outputUnit = signal('');
  protected readonly outputQty = signal<number | null>(null);
  /** The output's agreed rate into its item's stock unit; null when it needs none. */
  protected readonly outputFactor = signal<number | null>(null);
  /** The pair that rate was agreed for — the output row's half of {@link Line.factorFor}. */
  protected readonly outputFactorFor = signal<string | null>(null);

  /**
   * What the batch made, suggested from the first raw row it was made out of — a shop that
   * dyes KORA into KORA-chamki starts from the name it already typed rather than retyping it.
   * Clearing the box brings the suggestion back, so it can never be typed into a corner.
   */
  protected readonly suggestedOutputName = computed(
    () =>
      this.rawLines()
        .find((l) => l.name.trim())
        ?.name.trim() ?? '',
  );

  protected readonly outputName = computed(() =>
    this.outputNameTouched() ? this.typedOutputName() : this.suggestedOutputName(),
  );

  /** Typed-over cost and wastage, with the flag that says the suggestion no longer wins. */
  protected readonly typedUnitCost = signal<number | null>(null);
  protected readonly unitCostTouched = signal(false);
  protected readonly typedWastage = signal<number | null>(null);
  protected readonly wastageTouched = signal(false);

  protected readonly recent = new RecentLog();
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<'error.generic' | null>(null);

  /**
   * Rows that count. A row needs a name and a quantity; a zero price is allowed, because
   * a consumable the shop already owns outright still comes off the shelf.
   */
  private readonly validRaw = computed(() => this.rawLines().filter(isFilled));
  private readonly validProc = computed(() => this.procLines().filter(isFilled));

  /** What the batch consumed, in money — raw material and consumables together. */
  protected readonly totalCost = computed(
    () => sumAmount(this.validRaw()) + sumAmount(this.validProc()),
  );

  /** Cost/unit is only meaningful once there are units to spread the batch cost over. */
  protected readonly hasOutputQty = computed(() => (this.outputQty() ?? 0) > 0);

  /** The batch's cost spread over what it produced; 0 until an output quantity is entered. */
  protected readonly computedUnitCost = computed(() => {
    const qty = this.outputQty() ?? 0;
    // Rounded to paisa: the box shows the figure raw, and 13000/90 spelled out in
    // full is not something anyone wants to read or type over.
    return qty > 0 ? Math.round((this.totalCost() / qty) * 100) / 100 : 0;
  });

  /** What the entry actually saves: the typed figure once touched, the computed one until then. */
  protected readonly unitCost = computed(() =>
    this.unitCostTouched() ? (this.typedUnitCost() ?? 0) : this.computedUnitCost(),
  );

  /**
   * Raw in, output out — what the batch lost along the way, until the box is touched.
   *
   * Both sides have to be in one unit before subtracting means anything, and the one to use is
   * the output row's: it is what the shopkeeper is looking at, and what the wastage box is
   * therefore read and typed in. A raw row in another unit is carried across at whatever rate
   * the shop and the fixed table know between them.
   *
   * When there is no rate — cloth in metres against an output counted in pieces — the
   * subtraction is not merely unknown, it is meaningless. Nothing is suggested then, and the
   * box stays the shopkeeper's own. Guessing here used to be the bug: metres minus gaz came
   * out as a confident number that was not wastage.
   */
  protected readonly suggestedWastage = computed(() => {
    const outUnit = this.outputUnit().trim() || this.stockUnit(this.outputName()) || '';
    let raw = 0;

    for (const l of this.validRaw()) {
      const unit = l.unit.trim() || this.stockUnit(l.name) || '';
      if (!outUnit || !unit || sameUnit(unit, outUnit)) {
        raw += l.qty as number;
        continue;
      }
      const carried = resolveFactor(unit, outUnit, this.conversions.rates());
      if (!carried) {
        return 0;
      }
      raw += (l.qty as number) * carried.value;
    }

    return Math.round((raw - (this.outputQty() ?? 0)) * 100) / 100;
  });

  protected readonly wastage = computed(() =>
    this.wastageTouched() ? (this.typedWastage() ?? 0) : this.suggestedWastage(),
  );

  protected readonly canSave = computed(
    () =>
      this.validRaw().length > 0 &&
      this.validProc().length > 0 &&
      this.outputName().trim().length > 0 &&
      (this.outputQty() ?? 0) > 0 &&
      !this.saving(),
  );

  constructor() {
    void this.loadItems();
    // Same 404-before-a-store tolerance as the item list: the field is just empty.
    void this.partyApi
      .list()
      .catch(() => [] as Party[])
      .then((parties) => this.parties.set(parties));
    // The shop's own rates, so a than the shopkeeper already explained is not asked about
    // again. Swallows its own failure — the fixed table still answers metre and gaz.
    void this.conversions.load();
    // Same treatment for the store's unit list: the built-in defaults already loaded above
    // work fine until this arrives.
    void this.refreshUnitOptions();
  }

  /** Re-pulls the store's unit list — called after a save, since a raw/processing/output
   *  row's unit box may have just taught the store a name that isn't in the defaults yet. */
  private async refreshUnitOptions(): Promise<void> {
    try {
      this.unitOptions.set(await this.unitApi.names());
    } catch {
      // Non-fatal: the built-in defaults already loaded work fine on their own.
    }
  }

  private async loadItems(): Promise<void> {
    // 404s before a store exists; not an error here — names can still be typed free,
    // they just won't match an id.
    this.items.set(await this.itemApi.list().catch(() => [] as StoreItem[]));
  }

  // ── lines ──────────────────────────────────────────────────────────────
  /**
   * Whether anything has been written on a row. The unit is not counted: it arrives on its
   * own when a name is matched, so a row carrying only a unit is one nobody has written on.
   */
  protected written(l: Line): boolean {
    return !!l.name.trim() || l.qty != null || l.rate != null;
  }

  /** Keeps one ruled-but-unwritten row at the foot of a grid. See {@link ruleLines}. */
  private rule(lines: Line[], editing: number | null = null): Line[] {
    return ruleLines(lines, (l) => this.written(l), () => this.blankLine(), editing);
  }

  /** The mouse path to the row each grid is already holding open. */
  addRaw(): void {
    this.openFoot(this.rawLines, 'raw');
  }

  addProc(): void {
    this.openFoot(this.procLines, 'proc');
  }

  removeRaw(key: number): void {
    this.rawLines.update((ls) => this.rule(dropUnlessLast(key)(ls)));
  }

  removeProc(key: number): void {
    this.procLines.update((ls) => this.rule(dropUnlessLast(key)(ls)));
  }

  patchRaw(key: number, change: Partial<Line>): void {
    this.rawLines.update((ls) => this.rule(patch(key, change)(ls), key));
  }

  patchProc(key: number, change: Partial<Line>): void {
    this.procLines.update((ls) => this.rule(patch(key, change)(ls), key));
  }

  /** A matched item brings its unit and sale price with it, if the boxes are empty. */
  setRawName(key: number, value: string): void {
    this.rawLines.update((ls) => this.rule(ls.map(named(key, value, this.matchItem(value))), key));
  }

  setProcName(key: number, value: string): void {
    this.procLines.update((ls) => this.rule(ls.map(named(key, value, this.matchItem(value))), key));
  }

  /**
   * Enter finishes a row and opens the next, the same rhythm the sale and purchase grids
   * keep. Bound on the row itself, not the supplier fold under it: Enter in a supplier box
   * belongs to that box.
   */
  protected onRowKey(e: KeyboardEvent, key: number, grid: 'raw' | 'proc'): void {
    if (e.key !== 'Enter' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    e.preventDefault();
    const lines = grid === 'raw' ? this.rawLines() : this.procLines();
    const i = lines.findIndex((l) => l.key === key);
    // The foot row has nowhere to hand over to — it is the row being started.
    if (i >= 0 && i < lines.length - 1) {
      this.focusRow(lines[i + 1].key, grid);
    }
  }

  /** Put the caret on the row a grid is holding open, adding one only if it has none. */
  private openFoot(lines: WritableSignal<Line[]>, grid: 'raw' | 'proc'): void {
    const ls = lines();
    const foot = ls[ls.length - 1];
    if (foot && !this.written(foot)) {
      this.focusRow(foot.key, grid);
      return;
    }
    const line = this.blankLine();
    lines.update((prev) => [...prev, line]);
    this.focusRow(line.key, grid);
  }

  /**
   * Put the caret on a row's name box once it has rendered. Found by id rather than by view
   * child: the two grids share one row template, and the ids are already on the boxes for
   * their labels.
   */
  private focusRow(key: number, grid: 'raw' | 'proc'): void {
    requestAnimationFrame(() => {
      const el = document.getElementById(`${grid}-name-${key}`);
      (el as HTMLInputElement | null)?.select();
      el?.focus();
    });
  }

  // ── units ──────────────────────────────────────────────────────────────
  /**
   * The unit an item's stock is counted in — the unit every quantity has to reach the backend
   * in. Null for a name the catalogue doesn't hold yet (it will be created in whatever unit
   * the row names) or for an item nobody gave a unit to.
   */
  protected stockUnit(name: string): string | null {
    return this.matchItem(name)?.unit?.trim() || null;
  }

  /** A row's unit box was left — ask about it if it no longer matches the item's own unit. */
  async askRawUnit(key: number, force = false): Promise<void> {
    await this.askForLine(this.rawLines(), key, (change) => this.patchRaw(key, change), force);
  }

  async askProcUnit(key: number, force = false): Promise<void> {
    await this.askForLine(this.procLines(), key, (change) => this.patchProc(key, change), force);
  }

  /** Price per stock unit, backed out of whatever the row currently holds — same idea as the
   *  sale and purchase grids' rate box: the goods are worth the same per stock unit whether
   *  the row is written in it or in something else. */
  private baseRate(l: Line): number | null {
    if (l.rate == null) {
      return null;
    }
    return l.factor ? l.rate / l.factor : l.rate;
  }

  /** The shelf amount a row's quantity currently represents — the figure a unit change has to
   *  preserve, the same idea as {@link baseRate} for the price above it. Without this, retyping
   *  a settled row's unit box leaves the number in the quantity box untouched, and it is
   *  silently re-read under the new unit — "70 gz" becomes "70 than(16gz)", sixteen times what
   *  was actually on the table. */
  private baseQty(l: Line): number | null {
    if (l.qty == null) {
      return null;
    }
    return l.factor ? convertQty(l.qty, l.factor) : l.qty;
  }

  /** What the price/stockUnit box under a converted row reads — null until there's both a
   *  rate and a factor to divide it by, i.e. exactly when the note under the row is showing. */
  protected pricePerUnit(l: Line): number | null {
    if (!l.factor || l.rate == null) {
      return null;
    }
    return round2(l.rate / l.factor);
  }

  /** The price/stockUnit box under a converted raw row — the other side of its rate box. */
  setRawPricePerUnit(key: number, value: string): void {
    const line = this.rawLines().find((l) => l.key === key);
    const price = toNum(value);
    this.patchRaw(key, {
      rate: price == null ? null : line?.factor ? round2(price * line.factor) : price,
    });
  }

  /** Same, for a processing-item row. */
  setProcPricePerUnit(key: number, value: string): void {
    const line = this.procLines().find((l) => l.key === key);
    const price = toNum(value);
    this.patchProc(key, {
      rate: price == null ? null : line?.factor ? round2(price * line.factor) : price,
    });
  }

  /**
   * Open the slip for one row and keep what it settles on.
   *
   * A pair this shop (or the built-in table) already has an answer for is applied straight
   * away, with the rate scaled to match — the same "100/gaz reads 2100 in than(21gz)" rule
   * the sale and purchase grids use — and only a pair nobody has ever answered stops to ask.
   * Silent when the pair is already agreed, so tabbing through a row asks nothing; `force` is
   * the note under the row asking to be reopened, which always shows the sum, even for a pair
   * that was applied silently, since revisiting the rate is the point of the click.
   *
   * Declining puts the unit box back to the shelf's unit rather than leaving the row as it
   * was: a quantity sitting in a unit nothing converts is the exact mistake this feature
   * exists to prevent, and it must not be possible to walk away holding one.
   */
  private async askForLine(
    lines: Line[],
    key: number,
    apply: (change: Partial<Line>) => void,
    force = false,
  ): Promise<void> {
    const line = lines.find((l) => l.key === key);
    if (!line) {
      return;
    }

    const stock = this.stockUnit(line.name);
    const entered = line.unit.trim();
    const base = this.baseRate(line);
    const baseQty = this.baseQty(line);
    if (!stock || !entered || sameUnit(entered, stock)) {
      apply({
        factor: null,
        factorFor: null,
        rate: base == null ? line.rate : round2(base),
        qty: baseQty == null ? line.qty : round2(baseQty),
      });
      return;
    }
    if (!force && line.factorFor === pairKey(entered, stock)) {
      return; // already agreed, for this very pair
    }

    const known = force ? null : this.conversions.factor(entered, stock);
    let factor: number;
    if (known) {
      factor = known.value;
    } else {
      const answer = await this.slip.open({
        itemName: line.name.trim(),
        from: entered,
        to: stock,
        qty: line.qty,
      });
      if (answer === null) {
        apply({
          unit: stock,
          factor: null,
          factorFor: null,
          rate: base == null ? line.rate : round2(base),
          qty: baseQty == null ? line.qty : round2(baseQty),
        });
        return;
      }
      factor = answer.factor;
    }

    apply({
      factor,
      factorFor: pairKey(entered, stock),
      rate: base == null ? line.rate : round2(base * factor),
      qty: baseQty == null ? line.qty : round2(baseQty / factor),
    });
  }

  /** What {@link typedUnitCost} means per stock unit — the figure a unit change on the output
   *  row has to preserve, the same idea as {@link baseRate} for the raw and processing grids.
   *  Null when the box has never been typed over: the suggested cost re-derives itself fresh
   *  from the batch total every time, so there's nothing here that needs carrying across. */
  private baseUnitCost(): number | null {
    if (!this.unitCostTouched() || this.typedUnitCost() == null) {
      return null;
    }
    const factor = this.outputFactor();
    return factor ? (this.typedUnitCost() as number) / factor : (this.typedUnitCost() as number);
  }

  /** The output quantity's shelf equivalent — {@link baseQty} for the output row's own signals
   *  rather than a {@link Line}. Unlike cost, the quantity box has no fresh suggestion to fall
   *  back on, so there is nothing to gate on being "touched": whatever was typed is always
   *  what has to survive the unit box changing underneath it. */
  private baseOutputQty(): number | null {
    if (this.outputQty() == null) {
      return null;
    }
    const factor = this.outputFactor();
    return factor ? convertQty(this.outputQty() as number, factor) : (this.outputQty() as number);
  }

  /** What the price/stockUnit box beside the output's shelf note reads — null until there's a
   *  factor to divide the batch's cost/unit by. */
  protected outputPricePerUnit(): number | null {
    const factor = this.outputFactor();
    return factor ? round2(this.unitCost() / factor) : null;
  }

  /** The output's price/stockUnit box — the other side of the cost/unit box above it. */
  setOutputPricePerUnit(value: string): void {
    const price = toNum(value);
    const factor = this.outputFactor();
    this.unitCostTouched.set(true);
    this.typedUnitCost.set(price == null ? null : factor ? round2(price * factor) : price);
  }

  /**
   * The output's unit box was left — the same question, about what the batch made. Same
   * silent-apply-when-known rule as {@link askForLine}, and the same rate-preserving rescale,
   * but only when the cost box has actually been typed over: the computed suggestion already
   * re-derives itself fresh from the batch total in whatever unit is currently entered.
   */
  async askOutputUnit(force = false): Promise<void> {
    const name = this.outputName();
    const stock = this.stockUnit(name);
    const entered = this.outputUnit().trim();
    const base = this.baseUnitCost();
    const baseQty = this.baseOutputQty();

    if (!stock || !entered || sameUnit(entered, stock)) {
      this.outputFactor.set(null);
      this.outputFactorFor.set(null);
      if (base != null) {
        this.typedUnitCost.set(round2(base));
      }
      if (baseQty != null) {
        this.outputQty.set(round2(baseQty));
      }
      return;
    }
    if (!force && this.outputFactorFor() === pairKey(entered, stock)) {
      return;
    }

    const known = force ? null : this.conversions.factor(entered, stock);
    let factor: number;
    if (known) {
      factor = known.value;
    } else {
      const answer = await this.slip.open({
        itemName: name.trim(),
        from: entered,
        to: stock,
        qty: this.outputQty(),
      });
      if (answer === null) {
        this.outputUnit.set(stock);
        this.outputFactor.set(null);
        this.outputFactorFor.set(null);
        if (base != null) {
          this.typedUnitCost.set(round2(base));
        }
        if (baseQty != null) {
          this.outputQty.set(round2(baseQty));
        }
        return;
      }
      factor = answer.factor;
    }

    this.outputFactor.set(factor);
    this.outputFactorFor.set(pairKey(entered, stock));
    if (base != null) {
      this.typedUnitCost.set(round2(base * factor));
    }
    if (baseQty != null) {
      this.outputQty.set(round2(baseQty / factor));
    }
  }

  /**
   * What a row actually moves on the shelf: the quantity and the unit stock will record, which
   * is what the Effect panel has to show — a row that reads "120 Gaz" and books 109.73 Meter
   * would otherwise be describing something the shopkeeper cannot see.
   */
  protected shelf(l: Line): { qty: number; unit: string | null } {
    return l.factor
      ? { qty: convertQty(l.qty ?? 0, l.factor), unit: this.stockUnit(l.name) }
      : { qty: l.qty ?? 0, unit: l.unit.trim() || this.stockUnit(l.name) };
  }

  /** Show or hide a row's supplier boxes; closing one forgets what was typed in them. */
  toggleRawParty(key: number): void {
    this.rawLines.update((ls) => ls.map(togglePartyOn(key)));
  }

  toggleProcParty(key: number): void {
    this.procLines.update((ls) => ls.map(togglePartyOn(key)));
  }

  /** The output's unit follows the item it names, until something is typed in the box. */
  setOutputName(value: string): void {
    this.typedOutputName.set(value);
    // Emptying the box is not an edit, it is a retraction: the suggestion takes over again.
    this.outputNameTouched.set(value.trim().length > 0);
    const unit = this.matchItem(value)?.unit;
    if (!this.outputUnit() && unit) {
      this.outputUnit.set(unit);
    }
  }

  setUnitCost(value: string): void {
    this.unitCostTouched.set(true);
    this.typedUnitCost.set(toNum(value));
  }

  setWastage(value: string): void {
    this.wastageTouched.set(true);
    this.typedWastage.set(toNum(value));
  }

  lineAmount(l: Line): number {
    return (l.qty ?? 0) * (l.rate ?? 0);
  }

  toNum = toNum;

  // ── save ───────────────────────────────────────────────────────────────
  /**
   * Last check before posting: every row still in a unit its item is not stocked in, and not
   * already agreed for that exact pair, gets asked about now.
   *
   * The live path on the unit box catches nearly all of these, so this normally asks nothing.
   * It exists for the row that changed underneath its own answer — a name retyped after the
   * unit was settled, pointing the same "Gaz" at an item counted in pieces. Returns false if
   * anything was declined, and the save stops rather than going through on a row the
   * shopkeeper has just watched change.
   */
  private async reconcileUnits(): Promise<boolean> {
    const before = [
      ...this.rawLines().map((l) => l.unit),
      ...this.procLines().map((l) => l.unit),
      this.outputUnit(),
    ];

    for (const l of this.validRaw()) {
      await this.askForLine(this.rawLines(), l.key, (c) => this.patchRaw(l.key, c));
    }
    for (const l of this.validProc()) {
      await this.askForLine(this.procLines(), l.key, (c) => this.patchProc(l.key, c));
    }
    await this.askOutputUnit();

    const after = [
      ...this.rawLines().map((l) => l.unit),
      ...this.procLines().map((l) => l.unit),
      this.outputUnit(),
    ];
    // A declined slip is the only thing that rewrites a unit box, so an unchanged list means
    // everything was either already settled or agreed to just now.
    return before.length === after.length && before.every((u, i) => u === after[i]);
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    if (!(await this.reconcileUnits())) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);

    const outputName = this.outputName().trim();
    const outputQty = this.outputQty() as number;
    const outputFactor = this.outputFactor();
    // The output goes onto the shelf in its item's unit, so quantity, cost and wastage all
    // move together. Cost per unit is re-derived from the batch's total rather than divided by
    // the factor: the shelf rounds the quantity to two places, and a cost worked out against
    // the unrounded one would leave the batch costing a few paisa more or less than it did.
    const shelfQty = outputFactor ? convertQty(outputQty, outputFactor) : outputQty;
    const batchCost = outputQty * this.unitCost();

    try {
      await this.api.process({
        rawItems: this.validRaw().map((l) => this.toInput(l)),
        processingItems: this.validProc().map((l) => this.toInput(l)),
        output: {
          itemId: this.matchItem(outputName)?.id ?? null,
          name: outputName,
          unit: (outputFactor ? this.stockUnit(outputName) : this.outputUnit().trim()) || null,
          quantity: shelfQty,
          unitCost: outputFactor && shelfQty > 0 ? batchCost / shelfQty : this.unitCost(),
          wastage: outputFactor ? convertQty(this.wastage(), outputFactor) : this.wastage(),
        },
        billNumber: this.billNumber().trim() || null,
        billDate: this.billDate() || null,
        description: this.description().trim() || null,
      });

      this.recent.push(
        `${this.locale.t('processing.recent.label')} · ${outputName} · ${this.locale.money(this.unitCost())}`,
        this.locale.t('processing.recent.made', {
          // What went on the shelf, not what was typed — the log is a record, not an echo.
          qty: this.locale.qtyUnit(
            shelfQty,
            (outputFactor ? this.stockUnit(outputName) : this.outputUnit()) || null,
          ),
        }),
      );
      // A new output item is now in the catalogue, and consumables may have been created
      // too — reload so the next batch can autocomplete and match them by id. Same for a
      // party typed in free.
      await this.loadItems();
      this.parties.set(await this.partyApi.list().catch(() => this.parties()));
      void this.refreshUnitOptions();
      this.reset();
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  reset(): void {
    this.billNumber.set('');
    this.description.set('');
    this.rawLines.set([this.blankLine()]);
    this.procLines.set([this.blankLine()]);
    this.typedOutputName.set('');
    this.outputNameTouched.set(false);
    this.outputUnit.set('');
    this.outputQty.set(null);
    this.outputFactor.set(null);
    this.outputFactorFor.set(null);
    this.typedUnitCost.set(null);
    this.unitCostTouched.set(false);
    this.typedWastage.set(null);
    this.wastageTouched.set(false);
    this.errorKey.set(null);
    // Save + Next rhythm: land back on the first field so the next batch starts typing.
    this.firstField()?.nativeElement.focus();
  }

  // ── effect panel view ───────────────────────────────────────────────────
  /** Every filled input row, both sides — what the batch consumes. */
  private readonly validInputs = computed(() => [...this.validRaw(), ...this.validProc()]);

  /**
   * What leaves the shelf: one row per input, quantity with its unit, as stock will record
   * them. A converted row shows the converted figure — this panel is the screen's promise
   * about what is going to happen, so it has to be in the units it will happen in.
   * A service holds no stock and so appears nowhere here.
   */
  protected stockOut(): { key: number; name: string; qty: string }[] {
    return this.validInputs()
      .filter((l) => !l.service)
      .map((l) => {
        const shelf = this.shelf(l);
        return {
          key: l.key,
          name: l.name.trim(),
          qty: this.locale.qtyUnit(shelf.qty, shelf.unit),
        };
      });
  }

  /** The output as the shelf will hold it — the same promise, for what the batch made. */
  protected readonly outputShelf = computed(() => {
    const factor = this.outputFactor();
    const qty = this.outputQty() ?? 0;
    return factor
      ? { qty: convertQty(qty, factor), unit: this.stockUnit(this.outputName()) }
      : { qty, unit: this.outputUnit().trim() || this.stockUnit(this.outputName()) };
  });

  /**
   * The purchases the batch will post on its way in — one per supplier, summed over their
   * rows, the same grouping the backend does. Shown because they are the part of the entry
   * that moves money, and the shopkeeper should see it before saving.
   */
  protected readonly purchases = computed(() => {
    const byParty = new Map<string, { name: string; bill: number; paid: number }>();
    for (const l of this.validInputs()) {
      const name = l.party.trim();
      if (!name) {
        continue;
      }
      const row = byParty.get(name.toLowerCase()) ?? { name, bill: 0, paid: 0 };
      row.bill += (l.qty as number) * (l.rate ?? 0);
      row.paid += l.paid ?? 0;
      byParty.set(name.toLowerCase(), row);
    }
    // `owed` is signed the khata's way — positive is what still goes on their account,
    // negative is an overpayment they now owe back — and `amount` is what to print.
    return [...byParty.values()].map((row) => {
      const owed = row.bill - row.paid;
      return { ...row, owed, amount: Math.abs(owed) };
    });
  });

  /** Cash the batch takes out of the drawer, over every supplier on it. */
  protected readonly cashOut = computed(() => this.purchases().reduce((sum, p) => sum + p.paid, 0));

  // ── helpers ─────────────────────────────────────────────────────────────
  private matchItem(name: string): StoreItem | undefined {
    const q = name.trim().toLowerCase();
    return q ? this.items().find((i) => i.name.trim().toLowerCase() === q) : undefined;
  }

  private matchParty(name: string): Party | undefined {
    const q = name.trim().toLowerCase();
    return q ? this.parties().find((p) => p.name.trim().toLowerCase() === q) : undefined;
  }

  /**
   * One row as the API takes it; a blank supplier means the row just comes off the shelf.
   *
   * A converted row is sent in the unit its item is stocked in — quantity multiplied by the
   * agreed rate, unit replaced by the shelf's. The price is then re-derived from the row's own
   * amount rather than divided by the rate, and that difference matters: the shelf rounds the
   * quantity to two places, so a price scaled by the rate would multiply back to a few paisa
   * off the total the shopkeeper just read on screen. Deriving it from `qty × rate` keeps the
   * row's money exactly where it was, which is the one thing a unit change must never move.
   */
  private toInput(l: Line): ProcessingInput {
    const party = l.party.trim();
    const qty = l.qty as number;
    const rate = l.rate ?? 0;
    const shelfQty = l.factor ? convertQty(qty, l.factor) : qty;

    return {
      itemId: this.matchItem(l.name)?.id ?? null,
      name: l.name.trim(),
      unit: (l.factor ? this.stockUnit(l.name) : l.unit.trim()) || null,
      quantity: shelfQty,
      pricePerUnit: l.factor && shelfQty > 0 ? (qty * rate) / shelfQty : rate,
      party: party ? { partyId: this.matchParty(party)?.id ?? null, name: party } : null,
      paid: party ? (l.paid ?? 0) : null,
      service: l.service,
    };
  }

  private blankLine(): Line {
    return {
      key: this.keySeq++,
      name: '',
      unit: '',
      qty: null,
      rate: null,
      party: '',
      paid: null,
      open: false,
      service: false,
      factor: null,
      factorFor: null,
    };
  }
}

// Free functions rather than methods: they close over nothing and keep the class to state.
function isFilled(l: Line): boolean {
  return l.name.trim().length > 0 && (l.qty ?? 0) > 0;
}

function sumAmount(lines: Line[]): number {
  return lines.reduce((sum, l) => sum + (l.qty as number) * (l.rate ?? 0), 0);
}

function patch(key: number, change: Partial<Line>): (lines: Line[]) => Line[] {
  return (lines) => lines.map((l) => (l.key === key ? { ...l, ...change } : l));
}

/** Name a row, taking the matched item's unit and price for whichever box is still empty. */
function named(key: number, value: string, match: StoreItem | undefined): (l: Line) => Line {
  return (l) =>
    l.key === key
      ? {
          ...l,
          name: value,
          unit: l.unit || (match?.unit ?? ''),
          rate: l.rate == null && match?.salePrice != null ? match.salePrice : l.rate,
          // A service the catalogue already knows ticks its own box; a tick already made
          // stands, so retyping the name never undoes it — the box itself does that.
          service: l.service || (match?.service ?? false),
        }
      : l;
}

/** Open a row's supplier boxes, or close and clear them — a hidden supplier must not be sent. */
function togglePartyOn(key: number): (l: Line) => Line {
  return (l) =>
    l.key === key
      ? l.open
        ? { ...l, open: false, party: '', paid: null }
        : { ...l, open: true }
      : l;
}

/** A section always keeps one row, so its last one is cleared rather than removed. */
function dropUnlessLast(key: number): (lines: Line[]) => Line[] {
  return (lines) => (lines.length > 1 ? lines.filter((l) => l.key !== key) : lines);
}

function toNum(value: string): number | null {
  const n = Number(value);
  return value.trim() === '' || Number.isNaN(n) ? null : n;
}
