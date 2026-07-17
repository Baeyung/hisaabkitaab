import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ItemMovement, ItemStockRow } from './inventory.models';

/** Inventory reads: current stock per item and the per-item movement history. */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/inventory`;

  list(): Promise<ItemStockRow[]> {
    return firstValueFrom(this.http.get<ItemStockRow[]>(this.url));
  }

  getMovement(itemId: string): Promise<ItemMovement> {
    return firstValueFrom(this.http.get<ItemMovement>(`${this.url}/${itemId}`));
  }
}
