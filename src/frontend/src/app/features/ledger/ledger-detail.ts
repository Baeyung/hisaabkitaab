import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { PartyStatement, PartyStatementRow } from '../../core/store/ledger.models';
import { Balance } from '../../core/store/balance.models';
import { TransactionEventKind } from '../../core/store/cashbook.models';
import { TranslationKey } from '../../core/i18n/translations/en';
import { directionClass, directionKey } from '../../shared/balance.util';
import { PrintHeader } from '../../shared/print-header';
import { todayIso } from '../../shared/date.util';
import { PrintDetailsService } from '../../shared/print-details.service';
import { Select } from '../../shared/select/select';
import { DateField } from '../../shared/date-field/date-field';

/** Zero balance for a range with no rows in it. */
const SETTLED: Balance = { amount: 0, direction: 'SETTLED' };

/**
 * One party's khata statement: every entry with the running baqaya, clean
 * enough to read down the counter with the party on the phone. The party id
 * arrives via router input binding.
 */
@Component({
  selector: 'app-ledger-detail',
  imports: [RouterLink, PrintHeader, Select, DateField],
  templateUrl: './ledger-detail.html',
})
export class LedgerDetail {
  readonly partyId = input.required<string>();

  protected readonly locale = inject(LocaleService);
  private readonly api = inject(LedgerService);
  private readonly router = inject(Router);
  protected readonly printer = inject(PrintDetailsService);

  protected readonly statement = signal<PartyStatement | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  // Report filters — client-side over the already-loaded rows. Seeded from the
  // statement's own span on load (see `load`) so the range reads as "everything
  // so far" instead of rendering as two blank, collapsed date fields.
  protected readonly fromDate = signal(todayIso());
  protected readonly toDate = signal(todayIso());
  protected readonly eventFilter = signal('');

  /** Event kinds actually present, for the filter dropdown (statement order preserved). */
  protected readonly eventKinds = computed(() => [
    ...new Set((this.statement()?.rows ?? []).map((r) => r.event)),
  ]);

  protected readonly eventOptions = computed(() => [
    { value: '', label: this.locale.t('report.filter.allEvents') },
    ...this.eventKinds().map((kind) => ({ value: kind, label: this.eventLabel(kind) })),
  ]);

  protected readonly filteredRows = computed<PartyStatementRow[]>(() => {
    const from = this.fromDate();
    const to = this.toDate();
    const event = this.eventFilter();
    // row.date is an ISO `YYYY-MM-DD` string, so lexical comparison is a date comparison.
    return (this.statement()?.rows ?? []).filter(
      (row) =>
        (!from || row.date >= from) &&
        (!to || row.date <= to) &&
        (!event || row.event === event),
    );
  });

  /**
   * The stat cards, over the filtered rows so they always agree with the table
   * under them. Same maths the backend runs for the whole statement
   * (`LedgerQueryService.statement`): charges are IN, payments OUT, and the
   * balance is the last row's running balance — here the last *visible* one,
   * i.e. the baqaya as it stood at the end of the range. The header chip stays
   * on `currentBalance`: today's baqaya doesn't change because you filtered.
   */
  protected readonly stats = computed(() => {
    const rows = this.filteredRows();
    const total = (dir: 'IN' | 'OUT') =>
      rows.reduce((sum, row) => (row.inOut === dir ? sum + row.amount : sum), 0);
    return {
      totalBilled: total('IN'),
      totalPaid: total('OUT'),
      balance: rows.at(-1)?.runningBalance ?? SETTLED,
      // Rows are chronological, so the last payment in range is the latest one.
      lastPaymentDate: rows.filter((row) => row.inOut === 'OUT').at(-1)?.date ?? null,
    };
  });

  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;

  /** Bilingual label for an event kind — all kinds have a `report.event.*` key. */
  protected readonly eventLabel = (kind: TransactionEventKind): string =>
    this.locale.t(`report.event.${kind}` as TranslationKey);

  constructor() {
    effect(() => {
      void this.load(this.partyId());
    });
  }

  print(): void {
    const saleIds = (this.statement()?.rows ?? [])
      .filter((r) => r.event === 'SALE')
      .map((r) => r.transactionId);
    void this.printer.printWithDetails(saleIds);
  }

  /** A sale row's transactionId is the bill's id — open its detail. */
  openBill(transactionId: string): void {
    void this.router.navigate(['/bill-management', transactionId]);
  }

  async load(partyId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    try {
      const statement = await this.api.getStatement(partyId);
      this.statement.set(statement);
      // Rows are chronological (the running balance depends on it), so the ends
      // of the list are the range. Today is the floor for `to` so a party with
      // no entries yet — or one whose last entry is old — still reads sanely;
      // ISO dates compare lexically, so a future-dated row wins over today.
      const rows = statement.rows;
      const today = todayIso();
      const last = rows.at(-1)?.date ?? '';
      this.fromDate.set(rows[0]?.date ?? today);
      this.toDate.set(last > today ? last : today);
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
}
