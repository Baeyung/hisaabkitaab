import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { PartyStatement, PartyStatementRow } from '../../core/store/ledger.models';
import { TransactionEventKind } from '../../core/store/cashbook.models';
import { TranslationKey } from '../../core/i18n/translations/en';
import { directionClass, directionKey } from '../../shared/balance.util';
import { PrintHeader } from '../../shared/print-header';
import { PrintDetailsService } from '../../shared/print-details.service';

/**
 * One party's khata statement: every entry with the running baqaya, clean
 * enough to read down the counter with the party on the phone. The party id
 * arrives via router input binding.
 */
@Component({
  selector: 'app-ledger-detail',
  imports: [RouterLink, PrintHeader],
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

  // Report filters — client-side over the already-loaded rows. Empty = no bound.
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  protected readonly eventFilter = signal('');

  /** Event kinds actually present, for the filter dropdown (statement order preserved). */
  protected readonly eventKinds = computed(() => [
    ...new Set((this.statement()?.rows ?? []).map((r) => r.event)),
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
      this.statement.set(await this.api.getStatement(partyId));
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
