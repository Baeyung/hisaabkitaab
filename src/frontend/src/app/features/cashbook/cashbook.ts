import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { CashbookService } from '../../core/store/cashbook.service';
import { CashbookDay, TransactionEventKind } from '../../core/store/cashbook.models';
import { EventService } from '../../core/store/event.service';
import { todayIso } from '../../shared/date.util';
import { PrintHeader } from '../../shared/print-header';
import { PrintDetailsService } from '../../shared/print-details.service';
import { DateField } from '../../shared/date-field/date-field';
import { entryEditLink, isEditableEntry } from '../../shared/entry-route';

/**
 * The cashbook (روزنامچہ) day view: opening balance, the day's cash in/out
 * with a running balance, and the closing balance. Native date input — the
 * batch user flips back a day, everyone else stays on today.
 */
@Component({
  selector: 'app-cashbook',
  imports: [RouterLink, PrintHeader, DateField],
  templateUrl: './cashbook.html',
})
export class Cashbook {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(CashbookService);
  private readonly events = inject(EventService);
  private readonly router = inject(Router);
  protected readonly printer = inject(PrintDetailsService);

  protected readonly fromDate = signal(todayIso());
  protected readonly toDate = signal(todayIso());
  protected readonly data = signal<CashbookDay | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noStore = signal(false);

  /** The row awaiting delete confirmation, and whether a delete is in flight. */
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal(false);

  protected readonly canEdit = isEditableEntry;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.noStore.set(false);
    try {
      this.data.set(await this.api.getRange(this.fromDate(), this.toDate()));
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

  print(): void {
    const saleIds = (this.data()?.rows ?? [])
      .filter((r) => r.event === 'SALE')
      .map((r) => r.transactionId);
    void this.printer.printWithDetails(saleIds);
  }

  /** A sale row's transactionId is the bill's id — open its detail. */
  openBill(transactionId: string): void {
    void this.router.navigate(['/bill-management', transactionId]);
  }

  /** Open the entry's screen in edit mode, prefilled. */
  editEntry(event: TransactionEventKind, transactionId: string): void {
    const link = entryEditLink(event, transactionId);
    if (link) {
      void this.router.navigate(link);
    }
  }

  askDelete(transactionId: string): void {
    this.deleteError.set(false);
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
    this.deleteError.set(false);
    try {
      await this.events.deleteEvent(id);
      this.pendingDelete.set(null);
      await this.load();
    } catch {
      this.deleteError.set(true);
    } finally {
      this.deleting.set(false);
    }
  }

  setFrom(value: string): void {
    if (!value || value === this.fromDate()) {
      return;
    }
    this.fromDate.set(value);
    void this.load();
  }

  setTo(value: string): void {
    if (!value || value === this.toDate()) {
      return;
    }
    this.toDate.set(value);
    void this.load();
  }

  /** "12 Jul, 14:05" from the row's entry timestamp — the range spans days, so the date matters. */
  time(occurredAt: string): string {
    const d = new Date(occurredAt);
    const day = d.toLocaleDateString(this.locale.locale(), { month: 'short', day: 'numeric' });
    return `${day}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
