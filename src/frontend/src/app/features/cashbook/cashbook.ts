import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { CashbookService } from '../../core/store/cashbook.service';
import { StoreService } from '../../core/store/store.service';
import { CashbookDay, TransactionEventKind } from '../../core/store/cashbook.models';
import { EventService } from '../../core/store/event.service';
import { todayIso } from '../../shared/date.util';
import { urlFilters } from '../../shared/url-filters';
import { PrintHeader } from '../../shared/print-header';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { PrintItemsSummary } from '../../shared/print-items-summary';
import { PrintDetailsService } from '../../shared/print-details.service';
import { DateField } from '../../shared/date-field/date-field';
import { entryEditLink, isEditableEntry } from '../../shared/entry-route';
import { TranslationKey } from '../../core/i18n/translations/en';
import { deleteErrorKey } from '../../core/store/delete-error';

/**
 * The cashbook (روزنامچہ) day view: opening balance, the day's cash in/out
 * with a running balance, and the closing balance. Native date input — the
 * batch user flips back a day, everyone else stays on today.
 */
@Component({
  selector: 'app-cashbook',
  imports: [RouterLink, PrintHeader, PrintItemsSummary, DateField, WhatsAppButton],
  templateUrl: './cashbook.html',
})
export class Cashbook {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(CashbookService);
  private readonly events = inject(EventService);
  private readonly router = inject(Router);
  protected readonly printer = inject(PrintDetailsService);

  /** The day (or span) being read, carried in the URL so Back walks it back. */
  protected readonly filters = urlFilters({ from: todayIso(), to: todayIso() });
  protected readonly data = signal<CashbookDay | null>(null);
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

  /** The bills fetched for this printout — empty unless "with details" was chosen. */
  protected readonly printedBills = computed(() => [...this.printer.bills().values()]);

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
    const saleIds = (this.data()?.rows ?? [])
      .filter((r) => r.event === 'SALE')
      .map((r) => r.transactionId);
    void this.printer.printWithDetails(saleIds);
  }

  /** A sale row's transactionId is the bill's id — open its detail. */
  openBill(transactionId: string): void {
    void this.router.navigate(this.stores.link('bill-management', transactionId));
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
