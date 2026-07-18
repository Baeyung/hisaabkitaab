import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { BillService } from '../../core/store/bill.service';
import { BillSummary } from '../../core/store/bill.models';

/** Local calendar day as `YYYY-MM-DD` — matches the backend's ISO LocalDate strings. */
function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Bill list — every SALE, newest first, searchable by bill number or party and
 * filtered to a date range (both ends default to today). Rows open the derived
 * bill view; the trash action deletes the sale after an inline confirm.
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
  protected readonly fromDate = signal(todayStr());
  protected readonly toDate = signal(todayStr());

  protected readonly confirmingId = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal(false);

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const from = this.fromDate();
    const to = this.toDate();
    // bill.date is an ISO `YYYY-MM-DD` string, so lexical comparison is a date comparison.
    return (this.bills() ?? []).filter(
      (bill) =>
        (!from || bill.date >= from) &&
        (!to || bill.date <= to) &&
        (!q ||
          (bill.billNumber ?? '').toLowerCase().includes(q) ||
          (bill.partyName ?? '').toLowerCase().includes(q)),
    );
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

  askDelete(id: string): void {
    this.deleteError.set(false);
    this.confirmingId.set(id);
  }

  cancelDelete(): void {
    this.confirmingId.set(null);
  }

  async confirmDelete(id: string): Promise<void> {
    this.deleting.set(true);
    this.deleteError.set(false);
    try {
      await this.api.delete(id);
      this.bills.update((list) => (list ?? []).filter((b) => b.id !== id));
      this.confirmingId.set(null);
    } catch {
      this.deleteError.set(true);
    } finally {
      this.deleting.set(false);
    }
  }
}
