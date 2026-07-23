import { ApplicationRef, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { BillService } from '../../core/store/bill.service';
import { BillDetail, BillSummary } from '../../core/store/bill.models';
import { PrintHeader } from '../../shared/print-header';
import { BillInvoice } from '../../shared/bill-invoice';
import { Select } from '../../shared/select/select';
import { DateField } from '../../shared/date-field/date-field';
import { LedgerService } from '../../core/store/ledger.service';
import { InventoryService } from '../../core/store/inventory.service';
import { PartyBalanceRow } from '../../core/store/ledger.models';
import { ItemStockRow } from '../../core/store/inventory.models';
import { todayIso } from '../../shared/date.util';

/**
 * Bill list — every SALE, newest first, searchable by bill number or party and
 * filtered to a date range (both ends default to today). Rows open the derived
 * bill view; the trash action deletes the sale after an inline confirm.
 */
@Component({
  selector: 'app-bill-management',
  imports: [RouterLink, PrintHeader, BillInvoice, Select, DateField],
  templateUrl: './bill-management.html',
})
export class BillManagement {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(BillService);
  private readonly ledger = inject(LedgerService);
  private readonly inventory = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly appRef = inject(ApplicationRef);

  protected readonly bills = signal<BillSummary[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noStore = signal(false);
  protected readonly query = signal('');
  protected readonly fromDate = signal(todayIso());
  protected readonly toDate = signal(todayIso());

  /** Server-side filters — changing either re-fetches; the dropdowns are populated once on init. */
  protected readonly partyFilter = signal('');
  protected readonly itemFilter = signal('');
  protected readonly parties = signal<PartyBalanceRow[]>([]);
  protected readonly items = signal<ItemStockRow[]>([]);
  protected readonly hasServerFilter = computed(() => !!this.partyFilter() || !!this.itemFilter());

  protected readonly partyOptions = computed(() => [
    { value: '', label: this.locale.t('bill.filter.allParties') },
    ...this.parties().map((p) => ({ value: p.partyId, label: p.name })),
  ]);
  protected readonly itemOptions = computed(() => [
    { value: '', label: this.locale.t('bill.filter.allItems') },
    ...this.items().map((i) => ({ value: i.itemId, label: i.name })),
  ]);

  protected readonly confirmingId = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal(false);

  /** Full details of the filtered bills, rendered as print-only invoices. */
  protected readonly printBills = signal<BillDetail[]>([]);
  protected readonly printing = signal(false);
  protected readonly printError = signal(false);

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
    void this.loadFilterOptions();
    // Re-fetch whenever a server-side filter changes; runs once on init too.
    effect(() => {
      const filters = { partyId: this.partyFilter(), itemId: this.itemFilter() };
      void this.load(filters);
    });
  }

  private async loadFilterOptions(): Promise<void> {
    try {
      const [parties, items] = await Promise.all([this.ledger.list(), this.inventory.list()]);
      this.parties.set(parties);
      this.items.set(items);
    } catch {
      // Dropdowns stay empty; the list itself still loads and reports its own errors.
    }
  }

  async load(filters?: { partyId?: string; itemId?: string }): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.noStore.set(false);
    try {
      this.bills.set(await this.api.list(filters));
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

  /** Fetch every filtered bill's details and print each as an invoice. */
  async printAll(): Promise<void> {
    const rows = this.filtered();
    if (rows.length === 0 || this.printing()) return;
    this.printing.set(true);
    this.printError.set(false);
    try {
      const bills = await this.api.getDetails(rows.map((b) => b.id));
      if (bills.length === 0) {
        this.printError.set(true);
        return;
      }
      this.printBills.set(bills);
      // Flush the invoices into the DOM before window.print() reads it.
      this.appRef.tick();
      window.print();
    } catch {
      this.printError.set(true);
    } finally {
      this.printing.set(false);
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
