import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CashbookDay } from './cashbook.models';
import { StoreService } from './store.service';

/** The cashbook day view for the store the user is currently in. */
@Injectable({ providedIn: 'root' })
export class CashbookService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('cashbook');
  }

  getRange(from: string, to: string): Promise<CashbookDay> {
    return firstValueFrom(this.http.get<CashbookDay>(this.url, { params: { from, to } }));
  }
}
