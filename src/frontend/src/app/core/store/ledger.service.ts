import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DerivedGroup, PartyBalanceRow, PartyStatement } from './ledger.models';

/** Khata reads: party balances and the per-party running-balance statement. */
@Injectable({ providedIn: 'root' })
export class LedgerService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/ledger`;

  list(): Promise<PartyBalanceRow[]> {
    return firstValueFrom(this.http.get<PartyBalanceRow[]>(this.url));
  }

  getStatement(partyId: string): Promise<PartyStatement> {
    return firstValueFrom(this.http.get<PartyStatement>(`${this.url}/${partyId}`));
  }

  /** Recurring expenses grouped by their note — the khata's "derived" rows. */
  listDerived(): Promise<DerivedGroup[]> {
    return firstValueFrom(this.http.get<DerivedGroup[]>(`${this.url}/derived`));
  }
}
