import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { BillDetail, BillSummary } from './bill.models';
import { StoreService } from './store.service';

/** Bill reads for the current store — every SALE transaction is a bill. */
@Injectable({ providedIn: 'root' })
export class BillService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('transactions/bills');
  }

  /** Optional party/item filters are applied server-side; blanks are omitted. */
  list(filters?: { partyId?: string; itemId?: string }): Promise<BillSummary[]> {
    let params = new HttpParams();
    if (filters?.partyId) params = params.set('partyId', filters.partyId);
    if (filters?.itemId) params = params.set('itemId', filters.itemId);
    return firstValueFrom(this.http.get<BillSummary[]>(this.url, { params }));
  }

  getDetail(id: string): Promise<BillDetail> {
    return firstValueFrom(this.http.get<BillDetail>(`${this.url}/${id}`));
  }

  /** Full details for many bills in one round-trip — the "print all" printout. Order is preserved. */
  getDetails(ids: string[]): Promise<BillDetail[]> {
    return firstValueFrom(this.http.post<BillDetail[]>(`${this.url}/details`, ids));
  }

  /** Delete a bill (SALE); the backend cascades its transaction lines away. */
  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
  }
}
