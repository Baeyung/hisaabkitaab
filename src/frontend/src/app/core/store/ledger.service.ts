import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CashGroup, ExpenseCategoryGroup, PartyBalanceRow, PartyStatement } from './ledger.models';
import { StoreService } from './store.service';

/** Khata reads for the current store: party balances and per-party statements. */
@Injectable({ providedIn: 'root' })
export class LedgerService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('ledger');
  }

  list(): Promise<PartyBalanceRow[]> {
    return firstValueFrom(this.http.get<PartyBalanceRow[]>(this.url));
  }

  getStatement(partyId: string): Promise<PartyStatement> {
    return firstValueFrom(this.http.get<PartyStatement>(`${this.url}/${partyId}`));
  }

  /**
   * Expenses totalled by category within a business-date range — the khata's spend heads,
   * with a count and a total each and no rows. The entries behind a head come from
   * {@link getExpenseCategory} when it is opened; a shop a few years in has tens of
   * thousands of them, and the khata screen prints none.
   */
  listExpenseCategories(from: string, to: string): Promise<ExpenseCategoryGroup[]> {
    return firstValueFrom(
      this.http.get<ExpenseCategoryGroup[]>(`${this.url}/expense-categories`, {
        params: { from, to },
      }),
    );
  }

  /** One spend head with its entries in the range — empty, not 404, when nothing falls in it. */
  getExpenseCategory(category: string, from: string, to: string): Promise<ExpenseCategoryGroup> {
    return firstValueFrom(
      this.http.get<ExpenseCategoryGroup>(
        `${this.url}/expense-categories/${encodeURIComponent(category)}`,
        { params: { from, to } },
      ),
    );
  }

  /** Walk-in cash trade in the range — no party — grouped into Sales and Purchases with their totals, no rows. */
  listCash(from: string, to: string): Promise<CashGroup[]> {
    return firstValueFrom(this.http.get<CashGroup[]>(`${this.url}/cash`, { params: { from, to } }));
  }

  /** One walk-in cash head with its entries in the range — 404s only on a kind that isn't one. */
  getCashGroup(kind: string, from: string, to: string): Promise<CashGroup> {
    return firstValueFrom(
      this.http.get<CashGroup>(`${this.url}/cash/${encodeURIComponent(kind)}`, {
        params: { from, to },
      }),
    );
  }
}
