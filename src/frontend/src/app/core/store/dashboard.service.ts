import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Dashboard } from './dashboard.models';

/**
 * The analytics dashboard for the signed-in user's store over a date window.
 * Store scoping is derived from the principal on the backend; before any store
 * exists the call comes back 404 — the screen handles that.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/dashboard`;

  getRange(from: string, to: string): Promise<Dashboard> {
    return firstValueFrom(this.http.get<Dashboard>(this.url, { params: { from, to } }));
  }
}
