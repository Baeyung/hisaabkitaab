import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { LedgerService } from '../../core/store/ledger.service';
import { ExpenseCategoryGroup } from '../../core/store/ledger.models';
import { EXPENSE_CATEGORY_LABEL } from '../../core/store/event.models';
import { PrintHeader } from '../../shared/print-header';

/**
 * One expense category's statement: every expense filed under it (parts, bijli,
 * salaries…) with its note and a running total. Reuses the khata's
 * expense-categories endpoint — it already carries each category's rows — and
 * looks the category up by its enum name, the route key.
 */
@Component({
  selector: 'app-category-detail',
  imports: [RouterLink, PrintHeader],
  templateUrl: './category-detail.html',
})
export class CategoryDetail {
  readonly key = input.required<string>();

  protected readonly locale = inject(LocaleService);
  protected readonly categoryLabel = EXPENSE_CATEGORY_LABEL;
  private readonly api = inject(LedgerService);

  protected readonly group = signal<ExpenseCategoryGroup | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

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
      const match = (await this.api.listExpenseCategories()).find((g) => g.category === key) ?? null;
      this.group.set(match);
      this.notFound.set(match === null);
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

  print(): void {
    window.print();
  }
}
