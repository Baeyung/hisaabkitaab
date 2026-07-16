import { Component, computed, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { PartyService } from '../../core/store/party.service';
import { StoreItemService } from '../../core/store/store-item.service';
import { EventService } from '../../core/store/event.service';
import { Party } from '../../core/store/party.models';
import { StoreItem } from '../../core/store/store-item.models';
import { EventRequest } from '../../core/store/event.models';

/** One line of cloth on the bill. `key` is a stable id for @for tracking. */
interface Line {
  key: number;
  design: string;
  qty: number | null;
  rate: number | null;
}

/** A just-saved entry, kept in-session for the "Just entered" rail. */
interface RecentEntry {
  key: number;
  summary: string;
  sub: string;
}

const easternDigits = '۰۱۲۳۴۵۶۷۸۹';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * SALE entry — the "Ledger Grid": a party (autocomplete), a grid of cloth lines
 * (design autocomplete → qty × rate), the cash received, and a live Effect panel
 * showing the consequence (drawer up, stock out, baqaya) in plain language. Saves
 * to `POST /api/event` and clears for the next entry (Save + Next rhythm), keeping
 * a session list of what was just entered.
 *
 * Autocomplete is native `<datalist>`: the typed party/design name is matched back
 * to a loaded record on save to attach its id; no match sends the name only, which
 * the backend tolerates (party creation lands later; items already resolve).
 *
 * Money: billAmount = sum(qty × rate); cashAmount = received. No kaat yet — see
 * docs/tickets/HK-sale-kaat-discount.md.
 */
@Component({
  selector: 'app-sale',
  templateUrl: './sale.html',
  styleUrl: './sale.css',
})
export class Sale {
  protected readonly locale = inject(LocaleService);
  private readonly partyApi = inject(PartyService);
  private readonly itemApi = inject(StoreItemService);
  private readonly events = inject(EventService);

  // Declared before any field that calls blankLine()/keySeq++ in its initializer —
  // class fields init top-to-bottom, so `lines` below must see a real number, not
  // undefined (undefined++ → NaN, and NaN keys break @for tracking + patchLine).
  private keySeq = 1;

  /** Autocomplete sources; empty when there's no store yet (list 404s). */
  protected readonly parties = signal<Party[]>([]);
  protected readonly items = signal<StoreItem[]>([]);

  protected readonly partyName = signal('');
  protected readonly cashCustomer = signal(false);
  protected readonly billNumber = signal('');
  protected readonly billDate = signal(todayIso());
  protected readonly description = signal('');
  protected readonly received = signal<number | null>(null);

  protected readonly lines = signal<Line[]>([this.blankLine()]);
  protected readonly recent = signal<RecentEntry[]>([]);

  protected readonly saving = signal(false);
  protected readonly errorKey = signal<'error.generic' | null>(null);

  /** Lines with a name and a positive qty × rate — the only ones that count/send. */
  private readonly validLines = computed(() =>
    this.lines().filter((l) => l.design.trim() && (l.qty ?? 0) > 0 && (l.rate ?? 0) > 0),
  );

  protected readonly total = computed(() =>
    this.validLines().reduce((sum, l) => sum + (l.qty as number) * (l.rate as number), 0),
  );

  /** Cash received. A cash customer pays in full by definition, so it tracks the
   *  total (and the input is locked); otherwise it's what was actually handed over. */
  protected readonly effectiveReceived = computed(() =>
    this.cashCustomer() ? this.total() : (this.received() ?? 0),
  );

  /** Positive → the party owes you; negative → you owe them (overpaid). */
  protected readonly balance = computed(() => this.total() - this.effectiveReceived());

  protected readonly canSave = computed(() => this.validLines().length > 0 && !this.saving());

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

  toggleCashCustomer(): void {
    const next = !this.cashCustomer();
    this.cashCustomer.set(next);
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
    // On a match, prefill the rate from the item's sale price (only if still blank).
    const match = this.matchItem(value);
    this.patchLine(key, (l) => ({
      ...l,
      design: value,
      rate: l.rate == null && match?.salePrice != null ? match.salePrice : l.rate,
    }));
  }

  setQty(key: number, value: string): void {
    this.patchLine(key, (l) => ({ ...l, qty: this.toNum(value) }));
  }

  setRate(key: number, value: string): void {
    this.patchLine(key, (l) => ({ ...l, rate: this.toNum(value) }));
  }

  setReceived(value: string): void {
    this.received.set(this.toNum(value));
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

    const total = this.total();
    const name = this.partyName().trim();
    const partyLabel = this.cashCustomer() || !name ? this.locale.t('sale.party.cash') : name;

    const request: EventRequest = {
      transactionEvent: 'SALE',
      billAmount: total,
      cashAmount: this.effectiveReceived(),
      billNumber: this.billNumber().trim() || null,
      billDate: this.billDate() || null,
      description: this.description().trim() || null,
      party:
        this.cashCustomer() || !name ? null : { partyId: this.matchParty(name)?.id ?? null, name },
      items: this.validLines().map((l) => ({
        itemId: this.matchItem(l.design)?.id ?? null,
        name: l.design.trim(),
        quantity: l.qty as number,
        itemSoldAt: l.rate as number,
      })),
    };

    try {
      await this.events.publishEvent(request);
      this.recent.update((rs) =>
        [
          {
            key: this.keySeq++,
            summary: `${this.locale.t('sale.recent.sale')} · ${partyLabel} · ${this.money(total)}`,
            sub: this.locale.t('sale.recent.received', { amount: this.money(request.cashAmount ?? 0) }),
          },
          ...rs,
        ].slice(0, 6),
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
    this.cashCustomer.set(false);
    this.billNumber.set('');
    this.description.set('');
    this.received.set(null);
    this.lines.set([this.blankLine()]);
    this.errorKey.set(null);
  }

  // ── effect panel view ───────────────────────────────────────────────────
  /** Per-item stock reduction: the quantity (with unit, when the item is known)
   *  leaving stock for each valid line — what the STOCK-out actually moves. */
  protected stockView(): { key: number; name: string; qty: string }[] {
    return this.validLines().map((l) => {
      const unit = this.matchItem(l.design)?.unit ?? '';
      const qty = this.locale.formatNumber(l.qty as number);
      return { key: l.key, name: l.design.trim(), qty: unit ? `${qty} ${unit}` : qty };
    });
  }

  /** Baqaya line for the Effect panel: the party, which way it moves, and how much;
   *  null = settled. Names the party so "they owe you" isn't anonymous. */
  protected balanceView(): { tone: 'in' | 'out'; party: string; direction: string; amount: string } | null {
    const b = this.balance();
    if (Math.abs(b) < 0.005) {
      return null;
    }
    const name = this.partyName().trim();
    const party = this.cashCustomer() || !name ? this.locale.t('sale.party.cash') : name;
    return b > 0
      ? { tone: 'in', party, direction: this.locale.t('sale.effect.theyOwe'), amount: this.money(b) }
      : { tone: 'out', party, direction: this.locale.t('sale.effect.youOwe'), amount: this.money(-b) };
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  /** Rs figure with thousands grouping and script-localized digits. */
  protected money(n: number): string {
    const grouped = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const digits = this.locale.locale() === 'ur' ? grouped.replace(/\d/g, (c) => easternDigits[Number(c)]) : grouped;
    return 'Rs ' + digits;
  }

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
