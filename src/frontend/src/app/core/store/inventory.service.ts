import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ItemMovement, ItemStockRow } from './inventory.models';
import { StoreService } from './store.service';

/** Inventory reads for the current store: stock per item, and per-item movement history. */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('inventory');
  }

  list(): Promise<ItemStockRow[]> {
    return firstValueFrom(this.http.get<ItemStockRow[]>(this.url));
  }

  getMovement(itemId: string): Promise<ItemMovement> {
    return firstValueFrom(this.http.get<ItemMovement>(`${this.url}/${itemId}`));
  }
}
