import { ApplicationRef, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { deleteErrorKey } from '../../core/store/delete-error';
import { BillService } from '../../core/store/bill.service';
import { StoreService } from '../../core/store/store.service';
import { BillDetail, BillSummary } from '../../core/store/bill.models';
import { PrintHeader } from '../../shared/print-header';
import { PrintItemsSummary } from '../../shared/print-items-summary';
import { BillInvoice } from '../../shared/bill-invoice';
import { Select } from '../../shared/select/select';
import { DateField } from '../../shared/date-field/date-field';
import { LedgerService } from '../../core/store/ledger.service';
import { InventoryService } from '../../core/store/inventory.service';
import { PartyBalanceRow } from '../../core/store/ledger.models';
import { ItemStockRow } from '../../core/store/inventory.models';
import { todayIso } from '../../shared/date.util';
import { PrintDetailsService, PrintPromptKeys } from '../../shared/print-details.service';

/** Print prompt wording: "yes" is the report, "no" keeps the per-bill invoices. */
const PRINT_LAYOUT_PROMPT: PrintPromptKeys = {
  title: 'bill.printLayout.title',
  body: 'bill.printLayout.body',
  no: 'bill.printLayout.invoices',
  yes: 'bill.printLayout.report',
};

/**
 * What a printed run of bills adds up to — the report's footer line. A cash
 * sale that doesn't balance is a discount, not a khata entry; an overpaid party
 * bill leaves you owing them, so it nets off the receivable.
 */
export function sumBills(bills: BillDetail[]): {
  count: number;
  revenue: number;
  cash: number;
  khata: number;
  discount: number;
} {
  const totals = { count: bills.length, revenue: 0, cash: 0, khata: 0, discount: 0 };
  for (const b of bills) {
    totals.revenue += b.goodsTotal;
    totals.cash += b.cashReceived;
    if (b.outstanding.direction === 'SETTLED') {
      continue;
    }
    if (!b.partyName) {
      totals.discount += b.outstanding.amount;
    } else {
      totals.khata +=
        b.outstanding.direction === 'THEY_OWE_YOU' ? b.outstanding.amount : -b.outstanding.amount;
    }
  }
  return totals;
}

/**
 * Bill list — every SALE, newest first, searchable by bill number or party and
 * filtered to a date range (both ends default to today). Rows open the derived
 * bill view; the trash action deletes the sale after an inline confirm.
 */
@Component({
  selector: 'app-bill-management',
  imports: [RouterLink, PrintHeader, PrintItemsSummary, BillInvoice, Select, DateField],
  templateUrl: './bill-management.html',
})
export class BillManagement {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(BillService);
  private readonly ledger = inject(LedgerService);
  private readonly inventory = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly appRef = inject(ApplicationRef);
  private readonly printer = inject(PrintDetailsService);

  protected readonly bills = signal<BillSummary[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
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
  protected readonly deleteError = signal<TranslationKey | null>(null);

  /** Full details of the filtered bills, fetched on Print for either layout. */
  protected readonly printBills = signal<BillDetail[]>([]);
  protected readonly printing = signal(false);
  protected readonly printError = signal(false);
  /** false = one invoice per page (default), true = the list as one flowing report. */
  protected readonly reportMode = signal(false);

  /** Report layout only: a bill's lines, looked up from its row. */
  protected readonly printDetail = computed(
    () => new Map(this.printBills().map((b) => [b.id, b])),
  );

  /** Report footer — what the printed range added up to. */
  protected readonly printTotals = computed(() => sumBills(this.printBills()));

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
    try {
      this.bills.set(await this.api.list(filters));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Ask which layout, fetch every filtered bill's details, then print — either
   * one invoice per page or the whole list as a report with each bill's items
   * as sub-rows, which fits dozens of bills into a few pages.
   */
  async printAll(): Promise<void> {
    const rows = this.filtered();
    if (rows.length === 0 || this.printing()) return;
    const asReport = await this.printer.ask(PRINT_LAYOUT_PROMPT);
    if (asReport === null) return; // cancelled — don't print at all
    this.printing.set(true);
    this.printError.set(false);
    try {
      const bills = await this.api.getDetails(rows.map((b) => b.id));
      if (bills.length === 0) {
        this.printError.set(true);
        return;
      }
      this.reportMode.set(asReport);
      this.printBills.set(bills);
      // Flush the invoices / sub-rows into the DOM before window.print() reads it.
      this.appRef.tick();
      window.print();
    } catch {
      this.printError.set(true);
    } finally {
      this.printing.set(false);
    }
  }

  open(id: string): void {
    void this.router.navigate(this.stores.link('bill-management', id));
  }

  askDelete(id: string): void {
    this.deleteError.set(null);
    this.confirmingId.set(id);
  }

  cancelDelete(): void {
    this.confirmingId.set(null);
  }

  async confirmDelete(id: string): Promise<void> {
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.api.delete(id);
      this.bills.update((list) => (list ?? []).filter((b) => b.id !== id));
      this.confirmingId.set(null);
    } catch (err) {
      this.deleteError.set(deleteErrorKey(err, 'bill.delete.error'));
    } finally {
      this.deleting.set(false);
    }
  }
}
