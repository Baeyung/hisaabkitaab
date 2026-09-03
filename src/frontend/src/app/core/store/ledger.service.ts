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
   * Expenses totalled by category — the khata's spend heads, with a count and a total
   * each and no rows. The entries behind a head come from {@link getExpenseCategory}
   * when it is opened; a shop a few years in has tens of thousands of them, and the
   * khata screen prints none.
   */
  listExpenseCategories(): Promise<ExpenseCategoryGroup[]> {
    return firstValueFrom(this.http.get<ExpenseCategoryGroup[]>(`${this.url}/expense-categories`));
  }

  /** One spend head with its entries — 404s on a head with nothing in it. */
  getExpenseCategory(category: string): Promise<ExpenseCategoryGroup> {
    return firstValueFrom(
      this.http.get<ExpenseCategoryGroup>(
        `${this.url}/expense-categories/${encodeURIComponent(category)}`,
      ),
    );
  }

  /** Walk-in cash trade — no party — grouped into Sales and Purchases with their grand totals, no rows. */
  listCash(): Promise<CashGroup[]> {
    return firstValueFrom(this.http.get<CashGroup[]>(`${this.url}/cash`));
  }

  /** One walk-in cash head with its entries — 404s on a head with nothing in it. */
  getCashGroup(kind: string): Promise<CashGroup> {
    return firstValueFrom(this.http.get<CashGroup>(`${this.url}/cash/${encodeURIComponent(kind)}`));
  }
}
