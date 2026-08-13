import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { StoreItemService } from '../../core/store/store-item.service';
import { PartyService } from '../../core/store/party.service';
import { ProcessingService } from '../../core/store/processing.service';
import { ProcessingInput } from '../../core/store/processing.models';
import { StoreItem } from '../../core/store/store-item.models';
import { Party } from '../../core/store/party.models';
import { todayIso } from '../../shared/date.util';
import { RecentLog } from '../../shared/recent-log';
import { Combobox } from '../../shared/combobox/combobox';
import { DateField } from '../../shared/date-field/date-field';

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
 * Edits are not offered: the repricing a batch does cannot be un-averaged, so correcting one
 * is delete + re-enter.
 */
@Component({
  selector: 'app-processing',
  templateUrl: './processing.html',
  styleUrls: ['./sale.css', './processing.css'],
  imports: [Combobox, DateField],
})
export class Processing {
  protected readonly locale = inject(LocaleService);
  private readonly itemApi = inject(StoreItemService);
  private readonly partyApi = inject(PartyService);
  private readonly api = inject(ProcessingService);

  /** Batch-number box — where the cursor goes after a Save + Next. */
  private readonly firstField = viewChild<ElementRef<HTMLInputElement>>('firstField');

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

  /** Raw in, output out — what the batch lost along the way, until the box is touched. */
  protected readonly suggestedWastage = computed(
    () => sumQty(this.validRaw()) - (this.outputQty() ?? 0),
  );

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
  }

  private async loadItems(): Promise<void> {
    // 404s before a store exists; not an error here — names can still be typed free,
    // they just won't match an id.
    this.items.set(await this.itemApi.list().catch(() => [] as StoreItem[]));
  }

  // ── lines ──────────────────────────────────────────────────────────────
  addRaw(): void {
    this.rawLines.update((ls) => [...ls, this.blankLine()]);
  }

  addProc(): void {
    this.procLines.update((ls) => [...ls, this.blankLine()]);
  }

  removeRaw(key: number): void {
    this.rawLines.update(dropUnlessLast(key));
  }

  removeProc(key: number): void {
    this.procLines.update(dropUnlessLast(key));
  }

  patchRaw(key: number, change: Partial<Line>): void {
    this.rawLines.update(patch(key, change));
  }

  patchProc(key: number, change: Partial<Line>): void {
    this.procLines.update(patch(key, change));
  }

  /** A matched item brings its unit and sale price with it, if the boxes are empty. */
  setRawName(key: number, value: string): void {
    this.rawLines.update((ls) => ls.map(named(key, value, this.matchItem(value))));
  }

  setProcName(key: number, value: string): void {
    this.procLines.update((ls) => ls.map(named(key, value, this.matchItem(value))));
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
  async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);

    const outputName = this.outputName().trim();
    const outputQty = this.outputQty() as number;

    try {
      await this.api.process({
        rawItems: this.validRaw().map((l) => this.toInput(l)),
        processingItems: this.validProc().map((l) => this.toInput(l)),
        output: {
          itemId: this.matchItem(outputName)?.id ?? null,
          name: outputName,
          unit: this.outputUnit().trim() || null,
          quantity: outputQty,
          unitCost: this.unitCost(),
          wastage: this.wastage(),
        },
        billNumber: this.billNumber().trim() || null,
        billDate: this.billDate() || null,
        description: this.description().trim() || null,
      });

      this.recent.push(
        `${this.locale.t('processing.recent.label')} · ${outputName} · ${this.locale.money(this.unitCost())}`,
        this.locale.t('processing.recent.made', {
          qty: this.locale.qtyUnit(outputQty, this.outputUnit() || null),
        }),
      );
      // A new output item is now in the catalogue, and consumables may have been created
      // too — reload so the next batch can autocomplete and match them by id. Same for a
      // party typed in free.
      await this.loadItems();
      this.parties.set(await this.partyApi.list().catch(() => this.parties()));
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

  /** What leaves the shelf: one row per input, quantity with its unit. A service holds none. */
  protected stockOut(): { key: number; name: string; qty: string }[] {
    return this.validInputs()
      .filter((l) => !l.service)
      .map((l) => ({
        key: l.key,
        name: l.name.trim(),
        qty: this.locale.qtyUnit(
          l.qty as number,
          l.unit.trim() || this.matchItem(l.name)?.unit || null,
        ),
      }));
  }

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

  /** One row as the API takes it; a blank supplier means the row just comes off the shelf. */
  private toInput(l: Line): ProcessingInput {
    const party = l.party.trim();
    return {
      itemId: this.matchItem(l.name)?.id ?? null,
      name: l.name.trim(),
      unit: l.unit.trim() || null,
      quantity: l.qty as number,
      pricePerUnit: l.rate ?? 0,
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

function sumQty(lines: Line[]): number {
  return lines.reduce((sum, l) => sum + (l.qty as number), 0);
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
