import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { BalanceDirection } from '../../core/store/balance.models';
import { BillDetail } from '../../core/store/bill.models';
import { directionClass } from '../../shared/balance.util';
import { PrintHeader } from '../../shared/print-header';
import { ReportService } from './report.service';
import { DailyReport } from './report.models';

/** One line of the contents page: a numbered chapter and the one figure that summarises it. */
interface Chapter {
  no: number;
  name: string;
  note: string;
}

/**
 * Bills and purchases are the same paper read from two sides, so the page draws them from one
 * loop rather than twice — but the words on the cash line differ, and so do the totals.
 */
interface DocGroup {
  no: number;
  title: string;
  /** "Cash received" on a bill; "Cash paid" on a purchase. */
  cashLabel: string;
  /** What a document with nobody on it is called — the app's own words for a walk-in. */
  noParty: string;
  docs: BillDetail[];
  goodsTotal: number;
  cashTotal: number;
}

/**
 * One shop's whole day on paper — the document the nightly job WhatsApps to the owner.
 *
 * Nobody browses to this. It is opened by headless Chrome, from a URL the backend built, and
 * exists only to be printed: the token in the route is the credential (see `ReportService`),
 * and `data-report-ready` is the flag the renderer waits for before asking Chrome to print. If
 * the fetch fails that flag is deliberately never set — the renderer times out, the send is
 * recorded as failed, and no PDF goes out. A PDF that says "couldn't load" is worse than none.
 *
 * Laid out as a small book: a contents page carrying the day's headline figures, then one
 * chapter per section starting on its own sheet. That costs paper a quiet day does not need,
 * and buys the thing this report is actually for — a shopkeeper scrolling it on a phone in
 * WhatsApp, who can land on "Bills" without reading past the cashbook to find it.
 *
 * Written in English rather than through the translation dictionary, which is the one place in
 * the app that is true. A report has no reader at the keyboard to have chosen a language, and
 * the shop-level setting that would decide it does not exist yet; inventing Urdu strings the
 * scheduler can never select would be dead weight in both dictionaries. When reports learn a
 * language, this moves to `locale.t()` like everything else.
 *
 * Money still goes through `locale.money()` — that formats the same in both languages, and
 * hand-rolling rupee grouping here is exactly the kind of second opinion this app avoids.
 */
@Component({
  selector: 'app-daily-report',
  imports: [PrintHeader],
  templateUrl: './daily-report.html',
  styleUrl: './report.css',
})
export class DailyReportPage {
  /** All four bound from the route — see `app.routes.ts`. */
  readonly storeId = input.required<string>();
  readonly date = input.required<string>();
  readonly token = input.required<string>();

  protected readonly locale = inject(LocaleService);
  private readonly api = inject(ReportService);

  protected readonly report = signal<DailyReport | null>(null);

  /** Khatas that are actually owed one way or the other; a settled shop is not worth a page. */
  protected readonly owing = computed(
    () => this.report()?.parties.filter((p) => p.balance.direction !== 'SETTLED') ?? [],
  );

  /** The two sides of the khata list, each totalled — a net figure would hide both. */
  protected readonly toReceive = computed(() => this.owedTotal('THEY_OWE_YOU'));
  protected readonly toPay = computed(() => this.owedTotal('YOU_OWE_THEM'));

  /** Goods only — a service has no stock on hand to count at the close of the day. */
  protected readonly goods = computed(() => this.report()?.stock.filter((i) => !i.service) ?? []);

  protected readonly stockValue = computed(() =>
    this.goods().reduce((sum, i) => sum + this.itemValue(i.currentStock, i.costPrice), 0),
  );

  protected readonly groups = computed<DocGroup[]>(() => {
    const r = this.report();
    if (!r) {
      return [];
    }
    return [
      {
        no: 2,
        title: 'Bills',
        cashLabel: 'Cash received',
        noParty: 'Cash sale',
        ...this.totals(r.bills),
      },
      {
        no: 3,
        title: 'Purchases',
        cashLabel: 'Cash paid',
        noParty: 'Cash purchase',
        ...this.totals(r.purchases),
      },
    ];
  });

  /** The contents page. Numbered here so the list and the chapter headings can't drift apart. */
  protected readonly chapters = computed<Chapter[]>(() => {
    const r = this.report();
    if (!r) {
      return [];
    }
    const [bills, purchases] = this.groups();
    return [
      {
        no: 1,
        name: 'Cashbook',
        note: `${this.count(r.cashbook.rows.length, 'entry', 'entries')} · closing ${this.locale.money(r.cashbook.closingBalance)}`,
      },
      {
        no: bills.no,
        name: bills.title,
        note: `${this.count(bills.docs.length, 'bill', 'bills')} · ${this.locale.money(bills.goodsTotal)}`,
      },
      {
        no: purchases.no,
        name: purchases.title,
        note: `${this.count(purchases.docs.length, 'purchase', 'purchases')} · ${this.locale.money(purchases.goodsTotal)}`,
      },
      {
        no: 4,
        name: 'Khatas',
        note: `${this.count(this.owing().length, 'khata', 'khatas')} outstanding`,
      },
      {
        no: 5,
        name: 'Stock',
        note: `${this.count(this.goods().length, 'item', 'items')} · ${this.locale.money(this.stockValue())} at cost`,
      },
    ];
  });

  constructor() {
    // In an effect, not the constructor body: the router binds these inputs after the component
    // is constructed, so reading a required one here directly would throw. Same shape as
    // `ledger-detail.ts` and every other route that loads by its own path parameters.
    effect(() => {
      void this.load(this.storeId(), this.date(), this.token());
    });
  }

  protected tone(direction: BalanceDirection): string {
    return directionClass(direction);
  }

  /** "They owe" / "You owe", spelled here for the same reason the rest of the page is. */
  protected direction(direction: BalanceDirection): string {
    switch (direction) {
      case 'THEY_OWE_YOU':
        return 'To receive';
      case 'YOU_OWE_THEM':
        return 'To pay';
      default:
        return 'Settled';
    }
  }

  /**
   * What the gap between the goods and the cash is called. With a party on the document it
   * went on their khata; with nobody to put it on, it can only have been a discount — the
   * same reading `KhataAmount` makes on every screen.
   */
  protected gapLabel(partyName: string | null): string {
    return partyName ? 'On khata' : 'Discount';
  }

  /** "14:05" — the report is one day, so the date the cashbook screen prints would be noise. */
  protected time(occurredAt: string): string {
    const d = new Date(occurredAt);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** A goods line's own worth at cost, which is only a number when both halves are known. */
  protected itemValue(stock: number | null, cost: number | null): number {
    return (stock ?? 0) * (cost ?? 0);
  }

  private owedTotal(direction: BalanceDirection): number {
    return this.owing()
      .filter((p) => p.balance.direction === direction)
      .reduce((sum, p) => sum + p.balance.amount, 0);
  }

  private totals(docs: BillDetail[]): Pick<DocGroup, 'docs' | 'goodsTotal' | 'cashTotal'> {
    return {
      docs,
      goodsTotal: docs.reduce((sum, d) => sum + d.goodsTotal, 0),
      cashTotal: docs.reduce((sum, d) => sum + d.cashReceived, 0),
    };
  }

  private count(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
  }

  private async load(storeId: string, date: string, token: string): Promise<void> {
    this.report.set(await this.api.daily(storeId, date, token));
  }
}
