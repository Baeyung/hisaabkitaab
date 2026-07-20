import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { ExpenseCategoryGroup, PartyBalanceRow } from '../../core/store/ledger.models';
import { EXPENSE_CATEGORY_LABEL } from '../../core/store/event.models';
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
  protected readonly categories = signal<ExpenseCategoryGroup[]>([]);
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
  protected readonly categoryLabel = EXPENSE_CATEGORY_LABEL;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.noStore.set(false);
    try {
      const [parties, categories] = await Promise.all([this.api.list(), this.api.listExpenseCategories()]);
      this.parties.set(parties);
      this.categories.set(categories);
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

  openCategory(category: string): void {
    void this.router.navigate(['/ledger/category', category]);
  }

  print(): void {
    window.print();
  }
}
