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
}
