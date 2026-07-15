import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StoreItem, StoreItemDraft } from './store-item.models';

/**
 * CRUD for the catalog items in the signed-in user's store. The store is derived
 * from the principal on the backend, so nothing here supplies a store id. A `list`
 * before any store exists comes back 404 (no primary store) — callers handle that.
 */
@Injectable({ providedIn: 'root' })
export class StoreItemService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/store-items`;

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
}
