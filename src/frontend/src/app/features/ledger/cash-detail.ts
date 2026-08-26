import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { StoreService } from '../../core/store/store.service';
import { CashGroup, CashRow } from '../../core/store/ledger.models';
import { TranslationKey } from '../../core/i18n/translations/en';
import { PrintHeader } from '../../shared/print-header';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { AmountLegend } from '../../shared/amount-legend';
import { DateField } from '../../shared/date-field/date-field';
import { Combobox } from '../../shared/combobox/combobox';
import { RowWindowDirective, rowWindow } from '../../shared/row-window';
import { urlFilters } from '../../shared/url-filters';
import { todayIso } from '../../shared/date.util';

/**
 * One cash kind's statement: every walk-in Sale or Purchase — no party — with a
 * running total. Reuses the khata's cash endpoint — it already carries each
 * kind's rows — and looks the kind up by its enum name, the route key. A row
 * opens the bill in bill management.
 */
@Component({
  selector: 'app-cash-detail',
  imports: [RouterLink, PrintHeader, WhatsAppButton, AmountLegend, DateField, Combobox, RowWindowDirective],
  templateUrl: './cash-detail.html',
})
export class CashDetail {
  readonly key = input.required<string>();

  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(LedgerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly cashKindLabel = (kind: string): string =>
    this.locale.t(`ledger.cash.kind.${kind}` as TranslationKey);

  protected readonly group = signal<CashGroup | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  // `q` narrows by item/description; `from`/`to` by business date — client-side
  // over the already-loaded rows, and carried in the URL so Back walks them back.
  protected readonly filters = urlFilters({ q: '', from: todayIso(), to: todayIso() });

  protected readonly filteredRows = computed<CashRow[]>(() => {
    const q = this.filters.q().trim().toLowerCase();
    const from = this.filters.from();
    const to = this.filters.to();
    return (this.group()?.rows ?? []).filter(
      (row) =>
        (!from || row.date >= from) &&
        (!to || row.date <= to) &&
        (!q ||
          (row.itemSummary ?? '').toLowerCase().includes(q) ||
          (row.description ?? '').toLowerCase().includes(q)),
    );
  });

  /** The rows the table renders — a busy till's cash history runs to five figures. */
  protected readonly win = rowWindow(this.filteredRows);

  /** "Nothing matched" reads differently when it was the search that emptied the table. */
  protected readonly emptyKey = computed<TranslationKey>(() =>
    this.filters.q().trim() ? 'ledger.cash.search.none' : 'ledger.cash.detail.empty',
  );

  constructor() {
    effect(() => {
      void this.load(this.key());
    });
  }

  async load(key: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    try {
      const match = (await this.api.listCash()).find((g) => g.kind === key) ?? null;
      this.group.set(match);
      this.notFound.set(match === null);
      // Seed the range from the group's own span, same as the party statement —
      // reads as "everything so far" instead of two blank, collapsed date fields.
      // A URL already naming a range wins: it's a shared link, or a Back landing
      // here, and re-seeding would throw away what it asked for.
      if (match && !this.route.snapshot.queryParamMap.has('from')) {
        const rows = match.rows;
        const today = todayIso();
        const last = rows.at(-1)?.date ?? '';
        this.filters.replace({
          from: rows[0]?.date ?? today,
          to: last > today ? last : today,
        });
      }
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.notFound.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  openBill(transactionId: string): void {
    void this.router.navigate(this.stores.link('bill-management', transactionId));
  }

  print(): void {
    window.print();
  }
}
