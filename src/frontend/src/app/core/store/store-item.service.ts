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

  /**
   * Copy this store's catalog into other stores the caller also has a hand in — a shop with
   * several branches teaches its items once rather than typing the same names and prices into
   * every store. Unlike unit conversions, creating an item is not an upsert, so a name already
   * present in the target store (matched case-insensitively, trimmed) is left alone rather than
   * duplicated — copying twice is a no-op. Stock on the shelf is store-specific and doesn't
   * travel; only the catalog fields do.
   *
   * Best-effort per store: one item failing to create does not stop the rest, and one store
   * failing does not stop the others. Returns the ids that came back with at least one failure.
   */
  async copyTo(storeIds: readonly string[]): Promise<string[]> {
    const items = await this.list();
    const failed: string[] = [];

    await Promise.all(
      storeIds.map(async (id) => {
        const url = this.stores.apiFor(id, 'store-items');
        let existingNames: Set<string>;
        try {
          const existing = await firstValueFrom(this.http.get<StoreItem[]>(url));
          existingNames = new Set(existing.map((it) => it.name.trim().toLowerCase()));
        } catch {
          failed.push(id);
          return;
        }

        let ok = true;
        for (const item of items) {
          if (existingNames.has(item.name.trim().toLowerCase())) {
            continue;
          }
          try {
            await firstValueFrom(
              this.http.post<StoreItem>(url, {
                name: item.name,
                unit: item.unit,
                salePrice: item.salePrice,
                costPrice: item.costPrice,
                service: item.service,
              } satisfies StoreItemDraft),
            );
          } catch {
            ok = false;
          }
        }
        if (!ok) {
          failed.push(id);
        }
      }),
    );

    return failed;
  }
}
