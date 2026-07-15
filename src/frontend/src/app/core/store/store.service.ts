import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Store, StoreDraft } from './store.models';

/**
 * CRUD for the signed-in user's stores. Auth is attached by authInterceptor, so
 * every call here is already scoped to the current owner on the backend.
 *
 * Holds the loaded stores as shared state so the shell can gate store-dependent
 * nav (Items, Parties) on whether one exists yet. `null` means "not loaded".
 */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/stores`;

  private readonly _stores = signal<Store[] | null>(null);
  readonly stores = this._stores.asReadonly();
  readonly hasStore = computed(() => (this._stores()?.length ?? 0) > 0);

  async list(): Promise<Store[]> {
    const stores = await firstValueFrom(this.http.get<Store[]>(this.url));
    this._stores.set(stores);
    return stores;
  }

  async create(draft: StoreDraft): Promise<Store> {
    const store = await firstValueFrom(this.http.post<Store>(this.url, draft));
    this._stores.update((s) => [...(s ?? []), store]);
    return store;
  }

  async update(id: string, draft: StoreDraft): Promise<Store> {
    const store = await firstValueFrom(this.http.put<Store>(`${this.url}/${id}`, draft));
    this._stores.update((s) => (s ?? []).map((x) => (x.id === id ? store : x)));
    return store;
  }
}
