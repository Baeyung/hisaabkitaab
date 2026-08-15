import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';
import { Store, StoreDraft, StoreSettings } from './store.models';

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
  /**
   * Rank alone: EDITOR or OWNER, whatever the plan is doing. This is what gates the shop's
   * own settings, which stay open on a closed shop — the backend deliberately allows deleting
   * one (`@CurrentStore(allowLocked = true)`), so the screen carrying that button has to be
   * reachable or a downgrade leaves the shop un-deletable.
   */
  readonly canManage = computed(() => this.role() === 'OWNER' || this.role() === 'EDITOR');

  /**
   * May record work — entries, items, khatas, opening balances. Owners included.
   *
   * A shop the owner's plan has closed is false for everyone, owner included: it is
   * read-only until the plan makes room for it again. Folding that in here rather than at
   * each screen is what makes it stick — every write route is already behind `editorGuard`,
   * so they all refuse without knowing a plan exists. `isOwner` and {@link canManage}
   * deliberately stay true, so the owner keeps the settings screens they need to delete the
   * shop or free a seat.
   */
  readonly canEdit = computed(() => this.canManage() && !this.current()?.suspended);

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
   * Same shape as {@link api}, for a store other than the current one — the one caller so
   * far is copying a setting (unit conversions) from this store into another the user also
   * has a hand in. No membership check here: the backend's `@CurrentStore` on the receiving
   * end refuses anything the caller doesn't actually have `id` for, same as every other call.
   */
  apiFor(id: string, path: string): string {
    return `${this.url}/${id}/${path}`;
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
   * Replace how the current shop is arranged — the whole document, not a patch, since the
   * screen that edits it is holding all of it anyway.
   *
   * The response replaces the cached store, which is what makes the sidebar redraw the
   * moment it is saved: the shell's menu is computed from `current()`.
   */
  async updateSettings(settings: StoreSettings): Promise<Store> {
    const store = await firstValueFrom(this.http.put<Store>(this.api('settings'), settings));
    this._stores.update((s) => (s ?? []).map((x) => (x.id === store.id ? store : x)));
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
