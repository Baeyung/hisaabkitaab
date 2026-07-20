import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { EventService } from '../../core/store/event.service';
import {
  EventRequest,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  ExpenseCategory,
} from '../../core/store/event.models';
import { todayIso } from '../../shared/date.util';
import { RecentLog } from '../../shared/recent-log';
import { ToastState } from '../../shared/toast-state';

/**
 * EXPENSE entry (خرچ) — cash leaves the drawer for something that isn't a party
 * settlement: bijli, chai, rent, mazdoori, transport. The simplest of the entry
 * screens: an amount and what it was for.
 *
 * No party, by design. `ExpenseEventProcessor` posts a single CASH/OUT line and
 * no PARTY line, so naming a party here would leave their baqaya untouched — an
 * Effect panel promising a movement that never happens is exactly the kind of
 * thing that costs trust (APPLICATION_DOMAIN §3.5). Paying down what you owe a
 * party is {@link Payment}.
 *
 * Details are required, unlike the optional note on Payment/Receipt. Those rows
 * carry a party name that explains them; an expense has nothing else
 * identifying it, so the note *is* the record — and an unexplained "Rs 500" out
 * of the galla is what breaks the nightly reconciliation.
 *
 * Kept separate from {@link PartyCashEntry} rather than folded in behind a
 * "no party" flag: that component is about the party↔cash pair, and its whole
 * surface (autocomplete, unknown-name guard, baqaya row) is party machinery
 * this screen has no use for. The logic they genuinely share is extracted
 * instead — see `shared/recent-log`, `shared/toast-state`, `LocaleService.money`.
 */
@Component({
  selector: 'app-expense',
  templateUrl: './expense.html',
  styleUrl: './sale.css',
})
export class Expense {
  protected readonly locale = inject(LocaleService);
  private readonly events = inject(EventService);

  protected readonly toast = new ToastState();
  protected readonly recent = new RecentLog();

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly categoryLabel = EXPENSE_CATEGORY_LABEL;
  protected readonly billDate = signal(todayIso());
  protected readonly amount = signal<number | null>(null);
  protected readonly details = signal('');
  protected readonly billNumber = signal('');
  protected readonly category = signal<ExpenseCategory>('UNCATEGORIZED');
  protected readonly saving = signal(false);

  protected readonly total = computed(() => this.amount() ?? 0);

  protected readonly canSave = computed(
    () => this.total() > 0 && this.details().trim().length > 0 && !this.saving(),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.toast.dispose());
  }

  setAmount(value: string): void {
    const n = Number(value);
    this.amount.set(value.trim() === '' || Number.isNaN(n) ? null : n);
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }

    this.saving.set(true);
    const amount = this.total();
    const details = this.details().trim();

    const request: EventRequest = {
      transactionEvent: 'EXPENSE',
      cashAmount: amount,
      // No bill and no goods: an expense is bare cash out.
      billAmount: null,
      billNumber: this.billNumber().trim() || null,
      billDate: this.billDate() || null,
      description: details,
      party: null,
      items: [],
      expenseCategory: this.category(),
    };

    try {
      await this.events.publishEvent(request);
      // Details go on the sub-line, where Payment/Receipt put their counterparty:
      // it's the free-text half and can run long, so it reads better small.
      this.recent.push(
        `${this.locale.t('expense.recent.label')} · ${this.locale.money(amount)}`,
        details,
      );
      this.reset();
    } catch {
      this.toast.show(this.locale.t('error.generic'));
    } finally {
      this.saving.set(false);
    }
  }

  /** Clears the entry but keeps the date — a batch run stays on one day. */
  reset(): void {
    this.amount.set(null);
    this.details.set('');
    this.billNumber.set('');
    this.category.set('UNCATEGORIZED');
  }
}
