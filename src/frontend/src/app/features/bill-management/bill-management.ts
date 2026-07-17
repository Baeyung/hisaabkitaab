import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { BillService } from '../../core/store/bill.service';
import { BillSummary } from '../../core/store/bill.models';

/**
 * Bill list — every SALE, newest first, searchable by bill number or party.
 * Rows open the derived bill view.
 */
@Component({
  selector: 'app-bill-management',
  imports: [RouterLink],
  templateUrl: './bill-management.html',
})
export class BillManagement {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(BillService);
  private readonly router = inject(Router);

  protected readonly bills = signal<BillSummary[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noStore = signal(false);
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.bills() ?? [];
    return q
      ? all.filter(
          (bill) =>
            (bill.billNumber ?? '').toLowerCase().includes(q) ||
            (bill.partyName ?? '').toLowerCase().includes(q),
        )
      : all;
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.noStore.set(false);
    try {
      this.bills.set(await this.api.list());
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

  open(id: string): void {
    void this.router.navigate(['/bill-management', id]);
  }
}
