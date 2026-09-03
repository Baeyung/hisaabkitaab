import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { StoreService } from '../../core/store/store.service';
import { ExpenseCategoryGroup } from '../../core/store/ledger.models';
import { expenseCategoryLabel } from '../../core/store/event.models';
import { PrintHeader } from '../../shared/print-header';
import { WhatsAppButton } from '../../shared/whatsapp-button';
import { AmountLegend } from '../../shared/amount-legend';
import { RowWindowDirective, rowWindow } from '../../shared/row-window';
import { EventService } from '../../core/store/event.service';
import { ToastService } from '../../shared/toast/toast.service';
import { deleteErrorKey } from '../../core/store/delete-error';
import { entryEditLink } from '../../shared/entry-route';

/**
 * One expense category's statement: every expense filed under it (parts, bijli,
 * salaries…) with its note and a running total. Fetches the one head by its enum
 * name, the route key — the khata's list of heads carries counts and totals only,
 * so the rows are asked for here and nowhere else.
 */
@Component({
  selector: 'app-category-detail',
  imports: [RouterLink, PrintHeader, WhatsAppButton, AmountLegend, RowWindowDirective],
  templateUrl: './category-detail.html',
})
export class CategoryDetail {
  readonly key = input.required<string>();

  protected readonly locale = inject(LocaleService);

  protected readonly stores = inject(StoreService);
  private readonly api = inject(LedgerService);
  private readonly router = inject(Router);
  private readonly events = inject(EventService);
  private readonly toast = inject(ToastService);

  /** Display label for the spend head: seed tokens translated, custom names shown raw. */
  protected readonly categoryLabel = (name: string): string =>
    expenseCategoryLabel(name, (k) => this.locale.t(k));

  protected readonly group = signal<ExpenseCategoryGroup | null>(null);
  /**
   * The rows the table renders. A busy shop's bijli or salaries head runs to five figures
   * over a few years, and this screen is the whole of one — see shared/row-window.ts.
   */
  protected readonly win = rowWindow(computed(() => this.group()?.rows ?? []));

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  /** The row awaiting its delete confirmation, as an inline row rather than a modal. */
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly deleting = signal(false);

  constructor() {
    effect(() => {
      void this.load(this.key());
    });
  }

  async load(key: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    try {
      this.group.set(await this.api.getExpenseCategory(key));
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.notFound.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** Open the expense in the entry screen, prefilled — every row here is an EXPENSE. */
  editEntry(transactionId: string): void {
    const link = entryEditLink('EXPENSE', transactionId);
    if (link) {
      void this.router.navigate(this.stores.link(...link));
    }
  }

  askDelete(transactionId: string): void {
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
    try {
      await this.events.deleteEvent(id);
      this.pendingDelete.set(null);
      // Every running total below the deleted row is now wrong; refetch rather than splice.
      await this.load(this.key());
      this.toast.success(this.locale.t('entry.delete.success'));
    } catch (err) {
      this.toast.error(this.locale.t(deleteErrorKey(err, 'entry.delete.error')));
    } finally {
      this.deleting.set(false);
    }
  }

  print(): void {
    window.print();
  }
}
