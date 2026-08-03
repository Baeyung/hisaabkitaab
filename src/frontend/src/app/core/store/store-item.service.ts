import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreItem, StoreItemDraft } from './store-item.models';
import { StoreService } from './store.service';

/**
 * CRUD for the catalogue items in the store the user is currently in. Each shop
 * keeps its own items, so the store is named in the path.
 */
@Injectable({ providedIn: 'root' })
export class StoreItemService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('store-items');
  }

  list(): Promise<StoreItem[]> {
    return firstValueFrom(this.http.get<StoreItem[]>(this.url));
  }

  create(draft: StoreItemDraft): Promise<StoreItem> {
    return firstValueFrom(this.http.post<StoreItem>(this.url, draft));
  }

  update(id: string, draft: StoreItemDraft): Promise<StoreItem> {
    return firstValueFrom(this.http.put<StoreItem>(`${this.url}/${id}`, draft));
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
  }

  /** Upsert the item's opening stock quantity (0 clears it). Returns the stored quantity. */
  setOpeningStock(id: string, quantity: number): Promise<number> {
    return firstValueFrom(this.http.put<number>(`${this.url}/${id}/opening-stock`, { quantity }));
  }
}
