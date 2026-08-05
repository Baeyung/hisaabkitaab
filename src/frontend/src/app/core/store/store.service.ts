import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';
import { Store, StoreDraft } from './store.models';

/**
 * The stores the signed-in user can reach, and which one they are currently in.
 *
 * "Reach" covers both the shops they own and the ones another owner has shared with
 * them — {@link list} returns them together, each carrying the role it grants (see
 * {@link role}, {@link isOwner}, {@link canEdit}).
 *
 * A user can own several shops, so nothing is derived from the principal alone:
 * the chosen store is named in the URL (`/s/:storeId/…`), `storeGuard` validates
 * it and calls {@link select}, and every store-scoped API call is built through
 * {@link api} from that same id. `link` is the routing counterpart — both exist so
 * the id is threaded from one place instead of being spelled out at each call site.
 */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);
  private readonly url = `${environment.apiUrl}/stores`;

  private readonly _stores = signal<Store[] | null>(null);
  private readonly _currentId = signal<string | null>(null);

  readonly stores = this._stores.asReadonly();
  readonly currentId = this._currentId.asReadonly();
  /** The store being viewed, or null outside a store route (e.g. the picker). */
  readonly current = computed(() => this._stores()?.find((s) => s.id === this._currentId()) ?? null);

  /**
   * What this user may do in the store they are in. Null outside a store route — never
   * assume a role there. Every screen that hides a control reads one of these; the
   * backend refuses the same call anyway, so this is about not offering what would fail.
   */
  readonly role = computed(() => this.current()?.role ?? null);
  /** Their own shop: settings, the user list, and deleting things are all theirs. */
  readonly isOwner = computed(() => this.role() === 'OWNER');
  /** May record work — entries, items, khatas, opening balances. Owners included. */
  readonly canEdit = computed(() => this.role() === 'OWNER' || this.role() === 'EDITOR');

  constructor() {
    // This cache belongs to one session. Drop it when credentials go away
    // (logout or a 401) — otherwise the next user to sign in on this tab gets
    // gated against the previous user's stores.
    effect(() => {
      if (this.auth.credentials() === null) {
        this._stores.set(null);
        this._currentId.set(null);
      }
    });
  }

  /** Enter a store. Called by storeGuard once it has checked the id is really the user's. */
  select(id: string | null): void {
    this._currentId.set(id);
  }

  /**
   * A store-scoped API url: `api('parties')` → `/api/stores/{id}/parties`. Services
   * read this per call rather than caching it, since the current store changes as
   * the user switches shops.
   */
  api(path: string): string {
    return `${this.url}/${this.requireId()}/${path}`;
  }

  /**
   * A router link into the current store: `link('ledger', partyId)` →
   * `['/s', id, 'ledger', partyId]`. A segment may itself be a path
   * (`link('new-entry/sale')`), which is split — one array entry containing a
   * slash would otherwise be escaped into a single literal segment.
   */
  link(...segments: string[]): string[] {
    return ['/s', this.requireId(), ...segments.flatMap((s) => s.split('/').filter(Boolean))];
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

  /**
   * Erase a store and everything booked in it — the backend cascades to its
   * parties, items and transactions. `_currentId` is deliberately left alone:
   * the shell builds its nav through {@link link}, which throws without an id,
   * so it must survive until the caller has navigated out of the store route.
   */
  async delete(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
    this._stores.update((s) => (s ?? []).filter((x) => x.id !== id));
  }

  /** The current store's opening drawer balance — cash on hand at onboarding (0 when none). */
  getOpeningCash(): Promise<number> {
    return firstValueFrom(this.http.get<number>(this.api('opening-cash')));
  }

  /** Upsert the opening drawer balance (0 clears it). Single-sided — one CASH line, not a new entry each time. */
  setOpeningCash(amount: number): Promise<number> {
    return firstValueFrom(this.http.put<number>(this.api('opening-cash'), { amount }));
  }

  /**
   * The current store id. Throwing beats silently building `/api/stores/null/…`:
   * every caller runs inside a store route, so a missing id is a routing bug and
   * should read as one.
   */
  private requireId(): string {
    const id = this._currentId();
    if (!id) {
      throw new Error('No store selected — this belongs under an /s/:storeId route.');
    }
    return id;
  }
}
