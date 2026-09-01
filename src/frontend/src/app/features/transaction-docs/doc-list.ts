import { ApplicationRef, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { deleteErrorKey } from '../../core/store/delete-error';
import { BillService } from '../../core/store/bill.service';
import { EventService } from '../../core/store/event.service';
import { StoreService } from '../../core/store/store.service';
import { Balance } from '../../core/store/balance.models';
import { BillDetail, BillSummary } from '../../core/store/bill.models';
import { directionClass, directionKey } from '../../shared/balance.util';
import { RowWindowDirective, rowWindow } from '../../shared/row-window';
import { KhataAmount } from '../../shared/khata-amount';
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
import { urlFilters } from '../../shared/url-filters';
import { PrintDetailsService } from '../../shared/print-details.service';
import { DocConfig } from './doc-config';
import { sumBills, sumSummaries } from './doc-totals';
import { AmountLegend } from '../../shared/amount-legend';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * A run of goods documents — every bill, or every purchase — newest first,
 * searchable by number or party and filtered to a date range (both ends default
 * to today). Rows open the document; the trash action deletes the entry behind it
 * after an inline confirm.
 *
 * One screen for both events: a purchase list asks the same questions of the same
 * shape and only answers them in different words, so what varies is passed in as a
 * {@link DocConfig} — the same split as Sale/Purchase over one entry screen.
 */
@Component({
  selector: 'app-doc-list',
  imports: [
    RouterLink,
    PrintHeader,
    PrintItemsSummary,
    BillInvoice,
    Select,
    DateField,
    KhataAmount,
    AmountLegend,
    RowWindowDirective,
  ],
  templateUrl: './doc-list.html',
})
export class DocList {
  readonly config = input.required<DocConfig>();

  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;

  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(BillService);
  private readonly events = inject(EventService);
  private readonly toast = inject(ToastService);
  private readonly ledger = inject(LedgerService);
  private readonly inventory = inject(InventoryService);
  private readonly router = inject(Router);
  private readonly appRef = inject(ApplicationRef);
  private readonly printer = inject(PrintDetailsService);

  protected readonly bills = signal<BillSummary[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  /**
   * Every filter on the screen, carried in the URL: Back walks the list back
   * through the views it was narrowed to, and the link is worth sharing.
   * `party` and `item` are server-side — changing either re-fetches; the rest
   * sieve the loaded rows.
   */
  protected readonly filters = urlFilters({
    from: todayIso(),
    to: todayIso(),
    q: '',
    party: '',
    item: '',
  });

  /** Dropdown contents for the server-side filters, populated once on init. */
  protected readonly parties = signal<PartyBalanceRow[]>([]);
  protected readonly items = signal<ItemStockRow[]>([]);
  protected readonly hasServerFilter = computed(
    () => !!this.filters.party() || !!this.filters.item(),
  );

  protected readonly partyOptions = computed(() => [
    { value: '', label: this.locale.t(this.config().labels.filterAllParties) },
    ...this.parties().map((p) => ({ value: p.partyId, label: p.name })),
  ]);
  protected readonly itemOptions = computed(() => [
    { value: '', label: this.locale.t(this.config().labels.filterAllItems) },
    ...this.items().map((i) => ({ value: i.itemId, label: i.name })),
  ]);

  protected readonly confirmingId = signal<string | null>(null);
  protected readonly deleting = signal(false);

  /** Full details of the filtered documents, fetched on Print for either layout. */
  protected readonly printBills = signal<BillDetail[]>([]);
  protected readonly printing = signal(false);
  protected readonly printError = signal(false);
  /** false = one document per page (default), true = the list as one flowing report. */
  protected readonly reportMode = signal(false);

  /** Report layout only: a document's lines, looked up from its row. */
  protected readonly printDetail = computed(
    () => new Map(this.printBills().map((b) => [b.id, b])),
  );

  /** Report footer — what the printed range added up to, signed the way this kind runs. */
  protected readonly printTotals = computed(() =>
    sumBills(this.printBills(), this.config().owing),
  );

  /** The footer under the rows on screen — what the current filters add up to. */
  protected readonly listTotals = computed(() =>
    sumSummaries(this.filtered(), this.config().owing),
  );

  /**
   * The run's net khata as a balance, so the footer figure is coloured by the same rule as
   * the rows above it. `sumSummaries` runs positive the way this kind owes, so a negative
   * total means the run is a net overpayment and points the other way.
   */
  protected readonly khataTotal = computed<Balance>(() => {
    const net = this.listTotals().khata;
    // Same half-paisa tolerance the backend settles a balance at — these are doubles.
    if (Math.abs(net) < 0.005) {
      return { amount: 0, direction: 'SETTLED' };
    }
    const owing = this.config().owing;
    const other = owing === 'THEY_OWE_YOU' ? 'YOU_OWE_THEM' : 'THEY_OWE_YOU';
    return { amount: Math.abs(net), direction: net > 0 ? owing : other };
  });

  protected readonly filtered = computed(() => {
    const q = this.filters.q().trim().toLowerCase();
    const from = this.filters.from();
    const to = this.filters.to();
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

  /**
   * The rows the table renders — a year of bills runs to five figures. Windowing pauses
   * while a delete is being confirmed: that prompt is a row of its own, and scrolling it
   * out from under the shopkeeper mid-question would cancel it without saying so.
   */
  protected readonly win = rowWindow(this.filtered, {
    suspendWhile: () => this.confirmingId() !== null,
  });

  constructor() {
    void this.loadFilterOptions();
    // Re-fetch whenever a server-side filter changes — including a Back/Forward
    // that restored an earlier one. Runs once on init too.
    effect(() => {
      void this.load({ partyId: this.filters.party(), itemId: this.filters.item() });
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
      this.bills.set(await this.api.list(this.config().kind, filters));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Ask which layout, fetch every filtered document's details, then print — either
   * one per page or the whole list as a report with each document's items as
   * sub-rows, which fits dozens into a few pages.
   */
  async printAll(): Promise<void> {
    const rows = this.filtered();
    if (rows.length === 0 || this.printing()) return;
    const asReport = await this.printer.ask(this.config().labels.printLayout);
    if (asReport === null) return; // cancelled — don't print at all
    this.printing.set(true);
    this.printError.set(false);
    try {
      const bills = await this.api.getDetails(
        this.config().kind,
        rows.map((b) => b.id),
      );
      if (bills.length === 0) {
        this.printError.set(true);
        return;
      }
      this.reportMode.set(asReport);
      this.printBills.set(bills);
      // Flush the documents / sub-rows into the DOM before window.print() reads it.
      this.appRef.tick();
      window.print();
    } catch {
      this.printError.set(true);
    } finally {
      this.printing.set(false);
    }
  }

  /** Store-relative link to one document's own page. */
  protected docLink(id: string): string[] {
    return this.stores.link(this.config().route, id);
  }

  open(id: string): void {
    void this.router.navigate(this.docLink(id));
  }

  askDelete(id: string): void {
    this.confirmingId.set(id);
  }

  cancelDelete(): void {
    this.confirmingId.set(null);
  }

  async confirmDelete(id: string): Promise<void> {
    this.deleting.set(true);
    try {
      await this.events.deleteEvent(id);
      this.bills.update((list) => (list ?? []).filter((b) => b.id !== id));
      this.confirmingId.set(null);
      this.toast.success(this.locale.t('entry.delete.success'));
    } catch (err) {
      this.toast.error(this.locale.t(deleteErrorKey(err, this.config().labels.deleteError)));
    } finally {
      this.deleting.set(false);
    }
  }
}
