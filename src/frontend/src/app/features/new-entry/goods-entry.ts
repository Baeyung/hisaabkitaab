import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { PartyService } from '../../core/store/party.service';
import { StoreItemService } from '../../core/store/store-item.service';
import { EventService } from '../../core/store/event.service';
import { Party } from '../../core/store/party.models';
import { StoreItem } from '../../core/store/store-item.models';
import { EventRequest } from '../../core/store/event.models';
import { todayIso } from '../../shared/date.util';
import { RecentLog } from '../../shared/recent-log';
import { ruleLines } from '../../shared/ruled-lines';
import { Combobox } from '../../shared/combobox/combobox';
import { PrintHeader } from '../../shared/print-header';
import { DateField } from '../../shared/date-field/date-field';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { UnitConversionService } from '../../core/units/unit-conversion.service';
import { UnitService } from '../../core/units/unit.service';
import { ConversionSlipService } from '../../shared/conversion-slip/conversion-slip.service';
import { UnitNote } from '../../shared/conversion-slip/unit-note';
import { UNIT_SUGGESTIONS, convertQty, sameUnit } from '../../core/units/units';

/** One line of cloth on the bill. `key` is a stable id for @for tracking. */
interface Line {
  key: number;
  design: string;
  qty: number | null;
  rate: number | null;
  /**
   * The unit this line is being sold or bought in. Prefills from the item's own unit, which is
   * what it stays at on all but the odd line — a shop that stocks by the gaz and sells a roll
   * by the metre is the case this exists for.
   */
  unit: string;
  /** The rate agreed in the slip, from {@link unit} to the item's stock unit; null when none. */
  factor: number | null;
  /** The pair that rate was agreed for, so retyping the design re-asks. See processing.ts. */
  factorFor: string | null;
}

/** How a converted pair is keyed on a line — folded, so case never looks like a new pair. */
function pairKey(from: string, to: string): string {
  return `${from.trim().toLowerCase()}>${to.trim().toLowerCase()}`;
}

/**
 * The screen's copy. Keys are passed in as literals rather than built from a
 * prefix because `TranslationKey` is a union of the dictionary's literal keys —
 * concatenation would need a cast and lose the missing-key check.
 */
export interface GoodsEntryLabels {
  newEntry: TranslationKey;
  title: TranslationKey;
  party: TranslationKey;
  partyPh: TranslationKey;
  partyCashToggle: TranslationKey;
  /** Stands in for the party name when there's no khata (walk-in / one-off). */
  partyCash: TranslationKey;
  lines: TranslationKey;
  colDesign: TranslationKey;
  colDesignPh: TranslationKey;
  colQty: TranslationKey;
  colUnit: TranslationKey;
  colRate: TranslationKey;
  colAmount: TranslationKey;
  lineRemove: TranslationKey;
  lineAdd: TranslationKey;
  total: TranslationKey;
  /** "Cash received" on a sale, "Cash paid" on a purchase. */
  cash: TranslationKey;
  /** Knocked off the bill before cash is weighed — one given on a sale, one taken on a purchase. */
  discount: TranslationKey;
  billNumber: TranslationKey;
  billNumberPh: TranslationKey;
  description: TranslationKey;
  descriptionPh: TranslationKey;
  clear: TranslationKey;
  saveNext: TranslationKey;
  effect: TranslationKey;
  effectDrawer: TranslationKey;
  /** Heading over the per-item rows: "Stock out" / "Stock in". */
  effectStock: TranslationKey;
  /** Bill not yet fully settled — sale: "They owe you", purchase: "You owe them". */
  effectOutstanding: TranslationKey;
  /** Paid more than the bill — the mirror of {@link effectOutstanding}. */
  effectOverpaid: TranslationKey;
  effectSettled: TranslationKey;
  effectEmpty: TranslationKey;
  recent: TranslationKey;
  recentLabel: TranslationKey;
  /** Takes an `amount` — "Received {{amount}}" / "Paid {{amount}}". */
  recentCash: TranslationKey;
}

export interface GoodsEntryConfig {
  /** Namespaces the DOM ids so two instances could coexist. */
  idPrefix: string;
  eventType: 'SALE' | 'PURCHASE';
  /** Which way cash moves: 'in' fills the drawer (sale), 'out' empties it (purchase).
   *  Stock always moves the opposite way, so it's derived rather than configured. */
  drawerFlow: 'in' | 'out';
  /** Which catalog price seeds a matched line's rate: what you sell it for, or
   *  what it costs you. */
  ratePrefill: 'salePrice' | 'costPrice';
  labels: GoodsEntryLabels;
}

/**
 * Shared entry surface for the two goods-and-money events — SALE (فروخت) and
 * PURCHASE (خرید). The "Ledger Grid": a party (autocomplete), a grid of cloth
 * lines (design autocomplete → qty × rate), the cash moved, and a live Effect
 * panel showing the consequence (drawer, stock, baqaya) in plain language. Saves
 * to `POST /api/event` and clears for the next entry (Save + Next rhythm),
 * keeping a session list of what was just entered.
 *
 * The two events are arithmetic mirrors, not different sums: both compute
 * `balance = total − cash`, and only the *meaning* of that number flips. This
 * matches the backend's `PartyProcessor`, which derives the party side as
 * `cash − bill` for a sale and `bill − cash` for a purchase — the same magnitude
 * with the sign reversed. So the maths lives here once and the config only
 * decides how it reads: on a sale an unpaid balance means they owe you, on a
 * purchase it means you owe them.
 *
 * Autocomplete is native `<datalist>`: the typed party/design name is matched
 * back to a loaded record on save to attach its id; no match sends the name
 * only, which the backend tolerates (it creates unknown items; party creation
 * lands later).
 *
 * Money: billAmount = sum(qty × rate); cashAmount = moved; discountAmount is knocked off
 * the bill before cash is weighed against it (see docs/tickets/HK-sale-kaat-discount.md) —
 * the goods total itself stays the honest value of what moved, discount or not.
 *
 * Units: each line carries the unit it was sold or bought in, prefilled from the item and
 * usually left there. Sell in another one — a shop that stocks by the gaz handing over a roll
 * by the metre — and the conversion slip asks before the line is allowed to post, because
 * stock is only ever counted in the unit the catalogue item names. The bill is unaffected: it
 * prints and totals in the unit the customer bought in, at the rate they agreed, and only what
 * comes off the shelf is converted.
 */
@Component({
  selector: 'app-goods-entry',
  templateUrl: './goods-entry.html',
  styleUrl: './sale.css',
  imports: [Combobox, PrintHeader, DateField, WhatsAppButton, UnitNote],
})
export class GoodsEntry {
  readonly config = input.required<GoodsEntryConfig>();

  protected readonly locale = inject(LocaleService);
  private readonly partyApi = inject(PartyService);
  private readonly itemApi = inject(StoreItemService);
  private readonly events = inject(EventService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly conversions = inject(UnitConversionService);
  private readonly unitApi = inject(UnitService);
  private readonly slip = inject(ConversionSlipService);

  /**
   * Offered under every unit box. Starts from the built-in defaults and is replaced by the
   * store's own list once it loads, which includes any trade unit this shop has already typed
   * on an item or a conversion rate.
   */
  protected readonly unitOptions = signal<readonly string[]>(UNIT_SUGGESTIONS);

  /** Set from the `:entryId` route param — non-null means "edit this entry", not "add new". */
  protected readonly editId = signal<string | null>(null);

  /** Bill-number box — where the cursor goes after a Save + Next. */
  private readonly firstField = viewChild<ElementRef<HTMLInputElement>>('firstField');

  /** The item box of every line, in grid order — where a line hands over to the next. */
  private readonly designFields = viewChildren<Combobox>('designField');

  /** The chord printed on Save + Next. Named on the button rather than left to be discovered:
   *  Enter belongs to the grid here, so the save key has to say what it is. */
  protected readonly saveChord =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
      ? '⌘ ↵'
      : 'Ctrl ↵';

  // Declared before `lines` below, whose initializer calls blankLine() → keySeq++.
  // Class fields init top-to-bottom, so it must already be a real number here
  // (undefined++ → NaN, and NaN keys break @for tracking + patchLine).
  private keySeq = 1;

  /** Autocomplete sources; empty when there's no store yet (list 404s). */
  protected readonly parties = signal<Party[]>([]);
  protected readonly items = signal<StoreItem[]>([]);

  /** Just the names, for the combobox suggestion lists. */
  protected readonly partyNames = computed(() => this.parties().map((p) => p.name));
  protected readonly itemNames = computed(() => this.items().map((i) => i.name));

  protected readonly partyName = signal('');
  protected readonly cashParty = signal(false);
  protected readonly billNumber = signal('');
  protected readonly billDate = signal(todayIso());
  protected readonly description = signal('');
  protected readonly cash = signal<number | null>(null);
  /** Knocked off the bill before cash is weighed — allowed for any party, cash or khata. */
  protected readonly discount = signal<number | null>(null);

  /** Whether the cash box has been edited. Until it is, a cash party shows the
   *  total as a prefill; once touched, whatever's in the box wins — including
   *  empty, so clearing it doesn't snap back to the total. */
  protected readonly cashTouched = signal(false);

  protected readonly lines = signal<Line[]>([this.blankLine()]);
  protected readonly recent = new RecentLog();

  protected readonly saving = signal(false);
  protected readonly errorKey = signal<'error.generic' | null>(null);

  /** Stock moves against the cash: out of the shop on a sale, into it on a purchase. */
  protected readonly stockFlow = computed<'in' | 'out'>(() =>
    this.config().drawerFlow === 'in' ? 'out' : 'in',
  );

  /** Lines with a name and a positive qty × rate — the only ones that count/send. */
  private readonly validLines = computed(() =>
    this.lines().filter((l) => l.design.trim() && (l.qty ?? 0) > 0 && (l.rate ?? 0) > 0),
  );

  protected readonly total = computed(() =>
    this.validLines().reduce((sum, l) => sum + (l.qty as number) * (l.rate as number), 0),
  );

  /** What's actually owed once the discount is knocked off — the figure cash is weighed
   *  against, for a cash party or a khata one alike. */
  protected readonly discountAmount = computed(() => this.discount() ?? 0);
  protected readonly due = computed(() => this.total() - this.discountAmount());

  /** Cash moved. Once the box is touched it's exactly what changed hands; when
   *  untouched a cash party prefills to what's due after the discount, while a
   *  credit party defaults to nothing paid. */
  protected readonly effectiveCash = computed(() => {
    if (this.cashTouched()) {
      return this.cash() ?? 0;
    }
    return this.cashParty() ? this.due() : 0;
  });

  /** What's left unsettled on this bill, after the discount. Positive → outstanding
   *  (sale: they owe you; purchase: you owe them); negative → overpaid. */
  protected readonly balance = computed(() => this.due() - this.effectiveCash());

  protected readonly canSave = computed(() => this.validLines().length > 0 && !this.saving());

  /** Who the printed bill is made out to — the party, or the cash-sale label. */
  protected readonly printParty = computed(() => {
    const name = this.partyName().trim();
    return this.cashParty() || !name ? this.locale.t(this.config().labels.partyCash) : name;
  });

  /**
   * Valid lines flattened for the print-only bill table.
   *
   * In the unit the line was sold in, at the rate that was agreed — not the converted figures.
   * The bill is the customer's copy of what they bought: someone handed forty metres of cloth
   * across a counter, and a bill that says 43.74 Gaz because that is how the shop counts its
   * shelf is a bill they cannot check against what is in their hands.
   */
  protected readonly printLines = computed(() =>
    this.validLines().map((l) => ({
      name: l.design.trim(),
      qty: l.qty as number,
      unit: l.unit.trim() || this.lineUnit(l.design),
      rate: l.rate as number,
      amount: (l.qty as number) * (l.rate as number),
    })),
  );

  protected readonly abs = Math.abs;

  /** Print the current entry as a bill (letterhead + items + totals). */
  print(): void {
    window.print();
  }

  /**
   * The party this bill can be WhatsApp'd to — only one already on the books. A name
   * typed in but not saved yet has no khata and no number to send to, and a cash sale
   * has no party at all.
   */
  protected readonly sendParty = computed(() =>
    this.cashParty() ? undefined : this.matchParty(this.partyName()),
  );

  /** A walk-in sale has nobody to notify, so the button stays off the screen entirely. */
  protected readonly offerSend = computed(() => !this.cashParty() && !!this.partyName().trim());

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    await this.loadSources();
    const id = this.route.snapshot.paramMap.get('entryId');
    if (id) {
      await this.loadEntry(id);
    }
  }

  private async loadSources(): Promise<void> {
    // The shop's own rates, so a than it already explained is not asked about again. Loaded
    // alongside rather than awaited: it swallows its own failure, and the fixed table still
    // answers gaz and metre without it.
    void this.conversions.load();
    // Same treatment for the store's unit list: the built-in defaults already loaded above
    // work fine until this arrives.
    void this.unitApi
      .names()
      .then((names) => this.unitOptions.set(names))
      .catch(() => {});
    // Both lists 404 before a store exists; that's not an error here — you can
    // still type free-text names, they just won't match an id.
    const [parties, items] = await Promise.all([
      this.partyApi.list().catch(() => [] as Party[]),
      this.itemApi.list().catch(() => [] as StoreItem[]),
    ]);
    this.parties.set(parties);
    this.items.set(items);
  }

  private async loadEntry(id: string): Promise<void> {
    try {
      const e = await this.events.getEvent(id);
      this.editId.set(id);
      // No party on the entry means it was a cash sale/purchase — the same walk-in toggle.
      this.cashParty.set(e.party == null);
      this.partyName.set(e.party?.name ?? '');
      this.billNumber.set(e.billNumber ?? '');
      this.description.set(e.description ?? '');
      if (e.billDate) {
        this.billDate.set(e.billDate);
      }
      // Cash is exactly what was recorded — mark it touched so the prefill logic
      // doesn't override it with the total.
      this.cash.set(e.cashAmount);
      this.cashTouched.set(true);
      this.discount.set(e.discountAmount ?? null);
      // A saved line is already in its item's unit — that is the only way a quantity is ever
      // stored — so it reopens in that unit with nothing to convert.
      const lines = e.items.map<Line>((item) => ({
        key: this.keySeq++,
        design: item.name,
        qty: item.quantity,
        rate: item.itemSoldAt,
        unit: this.lineUnit(item.name),
        factor: null,
        factorFor: null,
      }));
      this.lines.set(this.rule(lines));
    } catch {
      this.errorKey.set('error.generic');
    }
  }

  toggleCashParty(): void {
    const next = !this.cashParty();
    this.cashParty.set(next);
    // Drop any typed cash so the box re-prefills cleanly (total for a cash party,
    // empty for a credit one) instead of carrying a stale override across.
    this.cash.set(null);
    this.cashTouched.set(false);
    if (next) {
      this.partyName.set('');
    }
  }

  // ── lines ──────────────────────────────────────────────────────────────
  /**
   * Whether anything has been written on a line. The unit is deliberately not counted: it
   * arrives on its own when a design is matched, so a line carrying only a unit is a line
   * nobody has written on yet.
   */
  protected written(l: Line): boolean {
    return !!l.design.trim() || l.qty != null || l.rate != null;
  }

  /** Keeps one ruled-but-unwritten line at the foot of the grid. See {@link ruleLines}. */
  private rule(lines: Line[], editing: number | null = null): Line[] {
    return ruleLines(lines, (l) => this.written(l), () => this.blankLine(), editing);
  }

  /**
   * The mouse path to the line the grid is already holding open. The grid rules its own lines
   * now, so this no longer makes one — it goes to the one waiting, which is what the button
   * always meant.
   */
  addLine(): void {
    const ls = this.lines();
    const foot = ls[ls.length - 1];
    if (foot && !this.written(foot)) {
      this.focusLine(foot.key);
      return;
    }
    const line = this.blankLine();
    this.lines.update((prev) => [...prev, line]);
    this.focusLine(line.key);
  }

  removeLine(key: number): void {
    this.lines.update((ls) => this.rule(ls.filter((l) => l.key !== key)));
  }

  /**
   * Enter finishes a line and opens the next — the rhythm of writing a bill, where the hand
   * never leaves the keyboard between designs.
   *
   * The combobox calls preventDefault() when Enter took one of its suggestions, so a defaulted
   * event is one it has already spent. A button inside the row keeps its own Enter, which is
   * its click.
   */
  protected onLineKey(e: KeyboardEvent, key: number): void {
    if (e.key !== 'Enter' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    e.preventDefault();
    const ls = this.lines();
    const i = ls.findIndex((l) => l.key === key);
    // The foot line has nowhere to hand over to — it is the line being started.
    if (i >= 0 && i < ls.length - 1) {
      this.focusLine(ls[i + 1].key);
    }
  }

  /** Put the caret on a line's item box, once the row it belongs to has rendered. */
  private focusLine(key: number): void {
    requestAnimationFrame(() => {
      const i = this.lines().findIndex((l) => l.key === key);
      this.designFields()[i]?.focus();
    });
  }

  setDesign(key: number, value: string): void {
    // On a match, prefill the rate and the unit from the catalog (only where still blank).
    const match = this.matchItem(value);
    const prefill = match?.[this.config().ratePrefill];
    this.patchLine(key, (l) => ({
      ...l,
      design: value,
      rate: l.rate == null && prefill != null ? prefill : l.rate,
      unit: l.unit || (match?.unit?.trim() ?? ''),
    }));
  }

  /** Keep the typed unit; the ask waits for the box to be left. See {@link askUnit}. */
  setUnit(key: number, value: string): void {
    this.patchLine(key, (l) => ({ ...l, unit: value }));
  }

  /**
   * The unit box was left. Anything but the item's own unit has to be agreed before the line
   * can post, so the slip opens; declining puts the box back to the shelf's unit, because a
   * quantity in a unit nothing converts is exactly the mistake being guarded against.
   *
   * Silent when the pair is already agreed, so tabbing through a line asks nothing; `force` is
   * the note under the line asking to be reopened.
   */
  async askUnit(key: number, force = false): Promise<void> {
    const line = this.lines().find((l) => l.key === key);
    if (!line) {
      return;
    }

    const stock = this.lineUnit(line.design);
    const entered = line.unit.trim();
    if (!stock || !entered || sameUnit(entered, stock)) {
      this.patchLine(key, (l) => ({ ...l, factor: null, factorFor: null }));
      return;
    }
    if (!force && line.factorFor === pairKey(entered, stock)) {
      return;
    }

    const answer = await this.slip.open({
      itemName: line.design.trim(),
      from: entered,
      to: stock,
      qty: line.qty,
    });

    this.patchLine(key, (l) =>
      answer === null
        ? { ...l, unit: stock, factor: null, factorFor: null }
        : { ...l, factor: answer.factor, factorFor: pairKey(entered, stock) },
    );
  }

  setQty(key: number, value: string): void {
    this.patchLine(key, (l) => ({ ...l, qty: this.toNum(value) }));
  }

  setRate(key: number, value: string): void {
    this.patchLine(key, (l) => ({ ...l, rate: this.toNum(value) }));
  }

  setCash(value: string): void {
    this.cashTouched.set(true);
    this.cash.set(this.toNum(value));
  }

  setDiscount(value: string): void {
    this.discount.set(this.toNum(value));
  }

  lineAmount(l: Line): number {
    return (l.qty ?? 0) * (l.rate ?? 0);
  }

  /** The catalog unit for a design (e.g. "Gaz", "Meter") — the unit its stock is counted in,
   *  and so the unit every quantity has to reach the backend in. Empty for a new/unmatched
   *  design, which is created in whatever unit the line names. */
  lineUnit(design: string): string {
    return this.matchItem(design)?.unit?.trim() ?? '';
  }

  /** What a line moves on the shelf: the quantity and unit stock will actually record. */
  private shelf(l: Line): { qty: number; unit: string } {
    return l.factor
      ? { qty: convertQty(l.qty ?? 0, l.factor), unit: this.lineUnit(l.design) }
      : { qty: l.qty ?? 0, unit: l.unit.trim() || this.lineUnit(l.design) };
  }

  // ── save ───────────────────────────────────────────────────────────────
  /**
   * Last check before posting: any line still in a unit its item is not stocked in, and not
   * already agreed for that exact pair, gets asked about now.
   *
   * Leaving the unit box catches nearly all of these, so this normally asks nothing. It is
   * here for the line that changed underneath its own answer — a design retyped after the unit
   * was settled. Returns false if anything was declined, and the save stops rather than going
   * through on a line the shopkeeper has just watched change.
   */
  private async reconcileUnits(): Promise<boolean> {
    const before = this.lines().map((l) => l.unit);
    for (const l of this.validLines()) {
      await this.askUnit(l.key);
    }
    const after = this.lines().map((l) => l.unit);
    // A declined slip is the only thing that rewrites a unit box.
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

    const labels = this.config().labels;
    const total = this.total();
    const name = this.partyName().trim();
    const partyLabel = this.cashParty() || !name ? this.locale.t(labels.partyCash) : name;

    const request: EventRequest = {
      transactionEvent: this.config().eventType,
      billAmount: total,
      cashAmount: this.effectiveCash(),
      discountAmount: this.discountAmount(),
      billNumber: this.billNumber().trim() || null,
      billDate: this.billDate() || null,
      description: this.description().trim() || null,
      party:
        this.cashParty() || !name ? null : { partyId: this.matchParty(name)?.id ?? null, name },
      // `itemSoldAt` is the wire name for the line rate on both events — what you
      // sold it at on a sale, what you bought it at on a purchase.
      //
      // A converted line ships the shelf's quantity, and its rate is re-derived from the
      // line's own amount rather than divided by the factor: the shelf rounds the quantity to
      // two places, so a scaled rate would multiply back to a few paisa off the bill the
      // customer just agreed to. `billAmount` above is the entered figures, untouched — the
      // bill is in the unit it was sold in, and only the stock moves in another.
      items: this.validLines().map((l) => {
        const qty = l.qty as number;
        const rate = l.rate as number;
        const shelfQty = this.shelf(l).qty;
        return {
          itemId: this.matchItem(l.design)?.id ?? null,
          name: l.design.trim(),
          quantity: shelfQty,
          itemSoldAt: l.factor && shelfQty > 0 ? (qty * rate) / shelfQty : rate,
        };
      }),
    };

    try {
      const editId = this.editId();
      if (editId) {
        await this.events.updateEvent(editId, request);
        this.location.back();
        return;
      }
      await this.events.publishEvent(request);
      this.recent.push(
        `${this.locale.t(labels.recentLabel)} · ${partyLabel} · ${this.locale.money(total)}`,
        this.locale.t(labels.recentCash, { amount: this.locale.money(request.cashAmount ?? 0) }),
      );
      this.reset();
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  /** Leave edit mode without saving — back to wherever the edit was launched from. */
  cancel(): void {
    this.location.back();
  }

  reset(): void {
    this.partyName.set('');
    this.cashParty.set(false);
    this.billNumber.set('');
    this.description.set('');
    this.cash.set(null);
    this.cashTouched.set(false);
    this.discount.set(null);
    this.lines.set([this.blankLine()]);
    this.errorKey.set(null);
    // Save + Next rhythm: land back on the first field so the next entry starts
    // typing straight away instead of reaching for the mouse.
    this.firstField()?.nativeElement.focus();
  }

  // ── effect panel view ───────────────────────────────────────────────────
  /** Per-item stock movement: the quantity (with unit, when the item is known)
   *  entering or leaving stock for each valid line — converted where the line was, since this
   *  panel is the screen's promise about what is going to happen to the shelf. */
  protected stockView(): { key: number; name: string; qty: string }[] {
    return this.validLines().map((l) => {
      const shelf = this.shelf(l);
      return {
        key: l.key,
        name: l.design.trim(),
        qty: this.locale.qtyUnit(shelf.qty, shelf.unit || null),
      };
    });
  }

  /** Baqaya line for the Effect panel: the party, which way it moves, and how much;
   *  null = settled. Names the party so "they owe you" isn't anonymous.
   *
   *  An outstanding bill leans the same way as the cash does — a sale's unpaid
   *  balance is money owed *to* you (tone 'in', like the drawer filling), a
   *  purchase's is money you owe *out*. Overpaying flips it. */
  protected balanceView(): { tone: 'in' | 'out'; party: string; direction: string; amount: string } | null {
    // A cash party has no khata to put a shortfall on — the discount box above is the
    // only adjustment a walk-in bill gets; anything past that has nowhere to land.
    if (this.cashParty()) {
      return null;
    }
    const b = this.balance();
    if (Math.abs(b) < 0.005) {
      return null;
    }
    const labels = this.config().labels;
    const flow = this.config().drawerFlow;
    const opposite = flow === 'in' ? 'out' : 'in';
    const name = this.partyName().trim();
    const party = this.cashParty() || !name ? this.locale.t(labels.partyCash) : name;
    return b > 0
      ? { tone: flow, party, direction: this.locale.t(labels.effectOutstanding), amount: this.locale.money(b) }
      : { tone: opposite, party, direction: this.locale.t(labels.effectOverpaid), amount: this.locale.money(-b) };
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  private matchParty(name: string): Party | undefined {
    const q = name.trim().toLowerCase();
    return this.parties().find((p) => p.name.trim().toLowerCase() === q);
  }

  private matchItem(name: string): StoreItem | undefined {
    const q = name.trim().toLowerCase();
    return this.items().find((i) => i.name.trim().toLowerCase() === q);
  }

  private toNum(value: string): number | null {
    const n = Number(value);
    return value.trim() === '' || Number.isNaN(n) ? null : n;
  }

  /** Every edit to a line goes through here, so every edit re-rules the grid. */
  private patchLine(key: number, fn: (l: Line) => Line): void {
    this.lines.update((ls) => this.rule(ls.map((l) => (l.key === key ? fn(l) : l)), key));
  }

  private blankLine(): Line {
    return {
      key: this.keySeq++,
      design: '',
      qty: null,
      rate: null,
      unit: '',
      factor: null,
      factorFor: null,
    };
  }
}
