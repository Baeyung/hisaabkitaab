import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';
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
  private readonly auth = inject(AuthStore);
  private readonly url = `${environment.apiUrl}/stores`;

  private readonly _stores = signal<Store[] | null>(null);
  readonly stores = this._stores.asReadonly();
  readonly hasStore = computed(() => (this._stores()?.length ?? 0) > 0);

  constructor() {
    // This cache belongs to one session. Drop it when credentials go away
    // (logout or a 401) — otherwise the next user to sign in on this tab gets
    // gated against the previous user's stores.
    effect(() => {
      if (this.auth.credentials() === null) {
        this._stores.set(null);
      }
    });
  }

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

  /** The store's opening drawer balance — cash on hand at onboarding (0 when none). */
  getOpeningCash(): Promise<number> {
    return firstValueFrom(this.http.get<number>(`${this.url}/opening-cash`));
  }

  /** Upsert the opening drawer balance (0 clears it). Single-sided — one CASH line, not a new entry each time. */
  setOpeningCash(amount: number): Promise<number> {
    return firstValueFrom(this.http.put<number>(`${this.url}/opening-cash`, { amount }));
  }
}
