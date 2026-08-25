import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Balance } from './balance.models';
import { OpeningBalanceDraft, Party, PartyDraft } from './party.models';
import { StoreService } from './store.service';

/**
 * CRUD for the parties (khata holders) in the store the user is currently in.
 * The store is named in the path, so switching shops switches these outright.
 */
@Injectable({ providedIn: 'root' })
export class PartyService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('parties');
  }

  list(): Promise<Party[]> {
    return firstValueFrom(this.http.get<Party[]>(this.url));
  }

  get(id: string): Promise<Party> {
    return firstValueFrom(this.http.get<Party>(`${this.url}/${id}`));
  }

  create(draft: PartyDraft): Promise<Party> {
    return firstValueFrom(this.http.post<Party>(this.url, draft));
  }

  update(id: string, draft: PartyDraft): Promise<Party> {
    return firstValueFrom(this.http.put<Party>(`${this.url}/${id}`, draft));
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
  }

  /** Upsert the party's opening balance (amount 0 clears it → SETTLED). Single-sided — no cash counterpart. */
  setOpeningBalance(id: string, draft: OpeningBalanceDraft): Promise<Balance> {
    return firstValueFrom(this.http.put<Balance>(`${this.url}/${id}/opening-balance`, draft));
  }

  /**
   * Copy this store's parties into other stores the caller also has a hand in — a shop with
   * several branches shares one customer list instead of retyping it. Unlike unit conversions,
   * creating a party is not an upsert, so a name already present in the target store (matched
   * case-insensitively, trimmed) is left alone rather than duplicated — copying twice is a
   * no-op, not a doubling. Opening balances are this store's own debt and don't travel.
   *
   * Best-effort per store: one party failing to create does not stop the rest, and one store
   * failing does not stop the others. Returns the ids that came back with at least one failure.
   */
  async copyTo(storeIds: readonly string[]): Promise<string[]> {
    const parties = await this.list();
    const failed: string[] = [];

    await Promise.all(
      storeIds.map(async (id) => {
        const url = this.stores.apiFor(id, 'parties');
        let existingNames: Set<string>;
        try {
          const existing = await firstValueFrom(this.http.get<Party[]>(url));
          existingNames = new Set(existing.map((p) => p.name.trim().toLowerCase()));
        } catch {
          failed.push(id);
          return;
        }

        let ok = true;
        for (const party of parties) {
          if (existingNames.has(party.name.trim().toLowerCase())) {
            continue;
          }
          try {
            await firstValueFrom(
              this.http.post<Party>(url, {
                name: party.name,
                contact: party.contact,
                address: party.address,
              } satisfies PartyDraft),
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
