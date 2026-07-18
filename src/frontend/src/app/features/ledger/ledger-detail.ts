import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { PartyStatement } from '../../core/store/ledger.models';
import { directionClass, directionKey } from '../../shared/balance.util';

/**
 * One party's khata statement: every entry with the running baqaya, clean
 * enough to read down the counter with the party on the phone. The party id
 * arrives via router input binding.
 */
@Component({
  selector: 'app-ledger-detail',
  imports: [RouterLink],
  templateUrl: './ledger-detail.html',
})
export class LedgerDetail {
  readonly partyId = input.required<string>();

  protected readonly locale = inject(LocaleService);
  private readonly api = inject(LedgerService);
  private readonly router = inject(Router);

  protected readonly statement = signal<PartyStatement | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;

  constructor() {
    effect(() => {
      void this.load(this.partyId());
    });
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
