import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { BalanceDirection } from '../../core/store/balance.models';
import { directionClass } from '../../shared/balance.util';
import { PrintHeader } from '../../shared/print-header';
import { ReportService } from './report.service';
import { DailyReport } from './report.models';

/**
 * One shop's whole day on paper — the document the nightly job WhatsApps to the owner.
 *
 * Nobody browses to this. It is opened by headless Chrome, from a URL the backend built, and
 * exists only to be printed: the token in the route is the credential (see `ReportService`),
 * and `data-report-ready` is the flag the renderer waits for before asking Chrome to print. If
 * the fetch fails that flag is deliberately never set — the renderer times out, the send is
 * recorded as failed, and no PDF goes out. A PDF that says "couldn't load" is worse than none.
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

  /** Goods only — a service has no stock on hand to count at the close of the day. */
  protected readonly goods = computed(() => this.report()?.stock.filter((i) => !i.service) ?? []);

  protected readonly stockValue = computed(() =>
    this.goods().reduce((sum, i) => sum + (i.currentStock ?? 0) * (i.costPrice ?? 0), 0),
  );

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

  private async load(storeId: string, date: string, token: string): Promise<void> {
    this.report.set(await this.api.daily(storeId, date, token));
  }
}
