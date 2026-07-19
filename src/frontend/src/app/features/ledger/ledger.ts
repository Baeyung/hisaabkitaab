import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { DerivedGroup, PartyBalanceRow } from '../../core/store/ledger.models';
import { directionClass, directionKey } from '../../shared/balance.util';
import { PrintHeader } from '../../shared/print-header';

/**
 * The khata list: every party with their baqaya and which way it points.
 * Rows open the party's statement. Search is client-side — a shop's party
 * list is at most a few hundred names.
 */
@Component({
  selector: 'app-ledger',
  imports: [RouterLink, PrintHeader],
  templateUrl: './ledger.html',
})
export class Ledger {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(LedgerService);
  private readonly router = inject(Router);

  protected readonly parties = signal<PartyBalanceRow[] | null>(null);
  protected readonly derived = signal<DerivedGroup[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noStore = signal(false);
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.parties() ?? [];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q) || (p.contact ?? '').includes(q)) : all;
  });

  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.noStore.set(false);
    try {
      const [parties, derived] = await Promise.all([this.api.list(), this.api.listDerived()]);
      this.parties.set(parties);
      this.derived.set(derived);
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.noStore.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  open(partyId: string): void {
    void this.router.navigate(['/ledger', partyId]);
  }

  /** The description is the group's identity; encode it for the route param. */
  encode(description: string): string {
    return encodeURIComponent(description);
  }

  openDerived(description: string): void {
    void this.router.navigate(['/ledger/derived', this.encode(description)]);
  }

  print(): void {
    window.print();
  }
}
