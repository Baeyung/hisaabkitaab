import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OpeningBalanceDraft, Party, PartyDraft } from './party.models';

/**
 * CRUD for the parties in the signed-in user's store. The store is derived from
 * the principal on the backend, so nothing here supplies a store id. A `list`
 * before any store exists comes back 404 (no primary store) — callers handle that.
 */
@Injectable({ providedIn: 'root' })
export class PartyService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/parties`;

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

  /** Upsert the party's opening balance (amount 0 clears it). Single-sided — no cash counterpart. */
  setOpeningBalance(id: string, draft: OpeningBalanceDraft): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.url}/${id}/opening-balance`, draft));
  }
}
