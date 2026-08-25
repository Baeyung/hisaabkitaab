import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { CashbookService } from '../../core/store/cashbook.service';
import { StoreService } from '../../core/store/store.service';
import { CashbookDay, TransactionEventKind } from '../../core/store/cashbook.models';
import { EventService } from '../../core/store/event.service';
import { todayIso } from '../../shared/date.util';
import { RowWindowDirective, rowWindow } from '../../shared/row-window';
import { urlFilters } from '../../shared/url-filters';
import { PrintHeader } from '../../shared/print-header';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { PrintItemsSummary } from '../../shared/print-items-summary';
import {
  DOC_INVOICE_LABELS,
  ExpandableDocs,
  PrintDetailsService,
} from '../../shared/print-details.service';
import { BillInvoice } from '../../shared/bill-invoice';
import { DateField } from '../../shared/date-field/date-field';
import { entryDetailLink, entryEditLink, isEditableEntry } from '../../shared/entry-route';
import { directionClass, directionKey } from '../../shared/balance.util';
import { KhataAmount } from '../../shared/khata-amount';
import { TranslationKey } from '../../core/i18n/translations/en';
import { deleteErrorKey } from '../../core/store/delete-error';
import { AmountLegend } from '../../shared/amount-legend';

/**
 * The cashbook (روزنامچہ) day view: opening balance, the day's cash in/out
 * with a running balance, and the closing balance. Native date input — the
 * batch user flips back a day, everyone else stays on today.
 */
@Component({
  selector: 'app-cashbook',
  imports: [
    RouterLink,
    PrintHeader,
    PrintItemsSummary,
    BillInvoice,
    DateField,
    WhatsAppButton,
    KhataAmount,
    AmountLegend,
    RowWindowDirective,
  ],
  templateUrl: './cashbook.html',
})
export class Cashbook {
  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;

  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(CashbookService);
  private readonly events = inject(EventService);
  private readonly router = inject(Router);
  protected readonly printer = inject(PrintDetailsService);

  /** The day (or span) being read, carried in the URL so Back walks it back. */
  protected readonly filters = urlFilters({ from: todayIso(), to: todayIso() });
  protected readonly data = signal<CashbookDay | null>(null);

  /**
   * The rows the table renders. A day is short, but the range picker will happily ask for a
   * year of a busy shop's entries. Windowing pauses while a delete is being confirmed — that
   * prompt is a row of its own, and scrolling it away would cancel it silently.
   */
  protected readonly win = rowWindow(computed(() => this.data()?.rows ?? []), {
    suspendWhile: () => this.pendingDelete() !== null,
  });
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  /** The row awaiting delete confirmation, and whether a delete is in flight. */
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<TranslationKey | null>(null);

  /**
   * Whether a row offers edit/delete at all: the entry has to be one of the editable
   * kinds (openings belong to Settings), and this user has to be allowed to write here.
   * A viewer sees the cashbook with no controls on it.
   */
  protected canEdit(event: TransactionEventKind): boolean {
    return this.stores.canEdit() && isEditableEntry(event);
  }

  /** Full invoice wording per kind, for the appended jump-linked pages. */
  protected readonly docInvoiceLabels = DOC_INVOICE_LABELS;

  /**
   * The documents fetched for this printout, in the same order their rows appear in the
   * table — empty unless "with details" was chosen. That order is what the row's jump-link
   * number and the appended page's own "#N of M" label both count against, so a viewer that
   * can't follow the link can still find the page by counting.
   */
  protected readonly printedDocs = computed(() =>
    (this.data()?.rows ?? [])
      .filter((row) => this.printer.docs().has(row.transactionId))
      .map((row) => this.printer.docs().get(row.transactionId)!),
  );
  /** Row transaction id → its 1-based position in {@link printedDocs}. */
  protected readonly docIndex = computed(() => {
    const map = new Map<string, number>();
    this.printedDocs().forEach((doc, i) => map.set(doc.id, i + 1));
    return map;
  });
  /** Split by kind for the closing items table: what was sold and what was bought are two
   * different stock stories, added up separately. */
  protected readonly soldDocs = computed(() =>
    this.printedDocs().filter((d) => d.kind === 'bills'),
  );
  protected readonly boughtDocs = computed(() =>
    this.printedDocs().filter((d) => d.kind === 'purchases'),
  );

  /** Heading over the second items table; the first keeps the component's "sold" default. */
  protected readonly boughtTitle: TranslationKey = 'print.items.bought';

  constructor() {
    // Fetch whenever the range changes — a picked date, or a Back/Forward that
    // restored an earlier one. Runs once on init.
    effect(() => {
      void this.load(this.filters.from(), this.filters.to());
    });
  }

  async load(from = this.filters.from(), to = this.filters.to()): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.data.set(await this.api.getRange(from, to));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  print(): void {
    void this.printer.printWithDetails(this.expandable());
  }

  /** The day's goods documents, by kind — the rows whose lines the details prompt expands. */
  private expandable(): ExpandableDocs {
    const ids = (event: TransactionEventKind) =>
      (this.data()?.rows ?? [])
        .filter((row) => row.event === event)
        .map((row) => row.transactionId);
    return { bills: ids('SALE'), purchases: ids('PURCHASE') };
  }

  /**
   * The row's own page, when it has one: the bill for a sale, the supplier's record for a
   * purchase, the batch for a processed-goods entry. Null elsewhere, and the template
   * leaves those rows unlinked.
   */
  protected detailLink(event: TransactionEventKind, transactionId: string): string[] | null {
    const link = entryDetailLink(event, transactionId);
    return link ? this.stores.link(...link) : null;
  }

  openDetail(event: TransactionEventKind, transactionId: string): void {
    const link = this.detailLink(event, transactionId);
    if (link) {
      void this.router.navigate(link);
    }
  }

  /** Open the entry's screen in edit mode, prefilled. */
  editEntry(event: TransactionEventKind, transactionId: string): void {
    const link = entryEditLink(event, transactionId);
    if (link) {
      void this.router.navigate(this.stores.link(...link));
    }
  }

  askDelete(transactionId: string): void {
    this.deleteError.set(null);
    this.pendingDelete.set(transactionId);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const id = this.pendingDelete();
    if (!id) {
      return;
    }
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.events.deleteEvent(id);
      this.pendingDelete.set(null);
      await this.load();
    } catch (err) {
      this.deleteError.set(deleteErrorKey(err, 'entry.delete.error'));
    } finally {
      this.deleting.set(false);
    }
  }

  /** "12 Jul, 14:05" from the row's entry timestamp — the range spans days, so the date matters. */
  time(occurredAt: string): string {
    const d = new Date(occurredAt);
    const day = d.toLocaleDateString(this.locale.locale(), { month: 'short', day: 'numeric' });
    return `${day}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
