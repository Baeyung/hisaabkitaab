import { Component, computed, inject, input, signal } from '@angular/core';
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
import { Combobox } from '../../shared/combobox/combobox';
import { PrintHeader } from '../../shared/print-header';

/** One line of cloth on the bill. `key` is a stable id for @for tracking. */
interface Line {
  key: number;
  design: string;
  qty: number | null;
  rate: number | null;
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
  colRate: TranslationKey;
  colAmount: TranslationKey;
  lineRemove: TranslationKey;
  lineAdd: TranslationKey;
  total: TranslationKey;
  /** "Cash received" on a sale, "Cash paid" on a purchase. */
  cash: TranslationKey;
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
 * Money: billAmount = sum(qty × rate); cashAmount = moved. No kaat yet — see
 * docs/tickets/HK-sale-kaat-discount.md.
 */
@Component({
  selector: 'app-goods-entry',
  templateUrl: './goods-entry.html',
  styleUrl: './sale.css',
  imports: [Combobox, PrintHeader],
})
export class GoodsEntry {
  readonly config = input.required<GoodsEntryConfig>();

  protected readonly locale = inject(LocaleService);
  private readonly partyApi = inject(PartyService);
  private readonly itemApi = inject(StoreItemService);
  private readonly events = inject(EventService);

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

  /** Cash moved. Once the box is touched it's exactly what changed hands; when
   *  untouched a cash party prefills to the full total (paying less is a forced
   *  discount), while a credit party defaults to nothing paid. */
  protected readonly effectiveCash = computed(() => {
    if (this.cashTouched()) {
      return this.cash() ?? 0;
    }
    return this.cashParty() ? this.total() : 0;
  });

  /** What's left unsettled on this bill. Positive → outstanding (sale: they owe
   *  you; purchase: you owe them); negative → overpaid, which reads the other way. */
  protected readonly balance = computed(() => this.total() - this.effectiveCash());

  protected readonly canSave = computed(() => this.validLines().length > 0 && !this.saving());

  /** Who the printed bill is made out to — the party, or the cash-sale label. */
  protected readonly printParty = computed(() => {
    const name = this.partyName().trim();
    return this.cashParty() || !name ? this.locale.t(this.config().labels.partyCash) : name;
  });

  /** Valid lines flattened for the print-only bill table. */
  protected readonly printLines = computed(() =>
    this.validLines().map((l) => ({
      name: l.design.trim(),
      qty: l.qty as number,
      unit: this.lineUnit(l.design),
      rate: l.rate as number,
      amount: (l.qty as number) * (l.rate as number),
    })),
  );

  /** Print the current entry as a bill (letterhead + items + totals). */
  print(): void {
    window.print();
  }

  constructor() {
    this.loadSources();
  }

  private async loadSources(): Promise<void> {
    // Both lists 404 before a store exists; that's not an error here — you can
    // still type free-text names, they just won't match an id.
    const [parties, items] = await Promise.all([
      this.partyApi.list().catch(() => [] as Party[]),
      this.itemApi.list().catch(() => [] as StoreItem[]),
    ]);
    this.parties.set(parties);
    this.items.set(items);
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
  addLine(): void {
    this.lines.update((ls) => [...ls, this.blankLine()]);
  }

  removeLine(key: number): void {
    this.lines.update((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  setDesign(key: number, value: string): void {
    // On a match, prefill the rate from the catalog (only if still blank).
    const prefill = this.matchItem(value)?.[this.config().ratePrefill];
    this.patchLine(key, (l) => ({
      ...l,
      design: value,
      rate: l.rate == null && prefill != null ? prefill : l.rate,
    }));
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

  lineAmount(l: Line): number {
    return (l.qty ?? 0) * (l.rate ?? 0);
  }

  /** The catalog unit for a design (e.g. "Gaz", "Meter"), so a qty of 100 reads as
   *  100 of that unit. Empty for a new/unmatched design — no unit is known yet. */
  lineUnit(design: string): string {
    return this.matchItem(design)?.unit ?? '';
  }

  // ── save ───────────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (!this.canSave()) {
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
      billNumber: this.billNumber().trim() || null,
      billDate: this.billDate() || null,
      description: this.description().trim() || null,
      party:
        this.cashParty() || !name ? null : { partyId: this.matchParty(name)?.id ?? null, name },
      // `itemSoldAt` is the wire name for the line rate on both events — what you
      // sold it at on a sale, what you bought it at on a purchase.
      items: this.validLines().map((l) => ({
        itemId: this.matchItem(l.design)?.id ?? null,
        name: l.design.trim(),
        quantity: l.qty as number,
        itemSoldAt: l.rate as number,
      })),
    };

    try {
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

  reset(): void {
    this.partyName.set('');
    this.cashParty.set(false);
    this.billNumber.set('');
    this.description.set('');
    this.cash.set(null);
    this.cashTouched.set(false);
    this.lines.set([this.blankLine()]);
    this.errorKey.set(null);
  }

  // ── effect panel view ───────────────────────────────────────────────────
  /** Per-item stock movement: the quantity (with unit, when the item is known)
   *  entering or leaving stock for each valid line. */
  protected stockView(): { key: number; name: string; qty: string }[] {
    return this.validLines().map((l) => {
      const unit = this.matchItem(l.design)?.unit ?? '';
      const qty = this.locale.formatNumber(l.qty as number);
      return { key: l.key, name: l.design.trim(), qty: unit ? `${qty} ${unit}` : qty };
    });
  }

  /** Baqaya line for the Effect panel: the party, which way it moves, and how much;
   *  null = settled. Names the party so "they owe you" isn't anonymous.
   *
   *  An outstanding bill leans the same way as the cash does — a sale's unpaid
   *  balance is money owed *to* you (tone 'in', like the drawer filling), a
   *  purchase's is money you owe *out*. Overpaying flips it. */
  protected balanceView(): { tone: 'in' | 'out'; party: string; direction: string; amount: string } | null {
    // A cash party has no khata, so any shortfall is a forced discount, not
    // baqaya — it walks away settled, never owing.
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

  private patchLine(key: number, fn: (l: Line) => Line): void {
    this.lines.update((ls) => ls.map((l) => (l.key === key ? fn(l) : l)));
  }

  private blankLine(): Line {
    return { key: this.keySeq++, design: '', qty: null, rate: null };
  }
}
