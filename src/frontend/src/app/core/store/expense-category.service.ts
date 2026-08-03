import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreService } from './store.service';

/** The current store's expense heads — the autocomplete source for the expense screen. */
@Injectable({ providedIn: 'root' })
export class ExpenseCategoryService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('expense-categories');
  }

  /** Category names, alphabetical. */
  names(): Promise<string[]> {
    return firstValueFrom(this.http.get<string[]>(this.url));
  }
}
