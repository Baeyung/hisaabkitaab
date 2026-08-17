import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DailyReport, PartyReminder } from './report.models';

/**
 * The one screen in the app that authenticates with something other than an account.
 *
 * A scheduled report is drawn by headless Chrome with nobody signed in — there are no stored
 * credentials to send, because there is no user. What there is instead is the token in the URL
 * the renderer was pointed at, minted minutes ago by the backend for this exact report, and
 * that goes on the request as a bearer.
 *
 * Nothing in the interceptor had to change for that: it attaches the stored Basic credentials
 * only when the request does not already carry an `Authorization` header (see
 * `auth.interceptor.ts`), so setting one here is enough to keep out of its way. Which also
 * means these calls are never mistaken for a signed-in user's and never trip the 401 handling
 * that would bounce a real one to the login screen.
 *
 * Not routed through `StoreService` like the other store-scoped services, and for the same
 * reason `block.ts` is not: those resolve their URL through a selected store, and no store has
 * been selected here — the shop is named in the URL, which is the whole of what identifies it.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/reports`;

  daily(storeId: string, date: string, token: string): Promise<DailyReport> {
    return firstValueFrom(
      this.http.get<DailyReport>(`${this.url}/daily/${storeId}/${date}`, {
        headers: this.bearer(token),
      }),
    );
  }

  reminder(storeId: string, partyId: string, date: string, token: string): Promise<PartyReminder> {
    return firstValueFrom(
      this.http.get<PartyReminder>(`${this.url}/reminder/${storeId}/${partyId}/${date}`, {
        headers: this.bearer(token),
      }),
    );
  }

  private bearer(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}
