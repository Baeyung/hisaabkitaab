import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { BillDetail, BillSummary, DocKind } from './bill.models';
import { StoreService } from './store.service';

/**
 * Goods-document reads for the current store: bills (every SALE) and purchases
 * (every PURCHASE). Both are the same three reads over the same shape, so `kind`
 * is simply the path segment they live under.
 *
 * Read-only. Deleting either goes through `EventService.deleteEvent` — a document
 * is an ordinary transaction, and that endpoint takes back any of them.
 */
@Injectable({ providedIn: 'root' })
export class BillService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private url(kind: DocKind): string {
    return this.stores.api(`transactions/${kind}`);
  }

  /** Optional party/item filters are applied server-side; blanks are omitted. */
  list(kind: DocKind, filters?: { partyId?: string; itemId?: string }): Promise<BillSummary[]> {
    let params = new HttpParams();
    if (filters?.partyId) params = params.set('partyId', filters.partyId);
    if (filters?.itemId) params = params.set('itemId', filters.itemId);
    return firstValueFrom(this.http.get<BillSummary[]>(this.url(kind), { params }));
  }

  getDetail(kind: DocKind, id: string): Promise<BillDetail> {
    return firstValueFrom(this.http.get<BillDetail>(`${this.url(kind)}/${id}`));
  }

  /** Full details for many documents in one round-trip — the "print all" printout. Order is preserved. */
  getDetails(kind: DocKind, ids: string[]): Promise<BillDetail[]> {
    return firstValueFrom(this.http.post<BillDetail[]>(`${this.url(kind)}/details`, ids));
  }
}
