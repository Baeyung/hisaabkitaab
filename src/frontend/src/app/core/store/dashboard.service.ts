import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Dashboard, StoreComparison } from './dashboard.models';
import { StoreService } from './store.service';

/** The analytics dashboard for the current store over a date window. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('dashboard');
  }

  getRange(from: string, to: string): Promise<Dashboard> {
    return firstValueFrom(this.http.get<Dashboard>(this.url, { params: { from, to } }));
  }

  /**
   * The same dashboard for every shop the user owns, over one window — the compare screen's
   * single call. Not store-scoped (there is no current store on the picker route), so it goes
   * to the account-level url rather than through {@link StoreService.api}.
   */
  compare(from: string, to: string): Promise<StoreComparison[]> {
    return firstValueFrom(
      this.http.get<StoreComparison[]>(`${environment.apiUrl}/stores/compare`, {
        params: { from, to },
      }),
    );
  }
}
