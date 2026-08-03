import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Dashboard } from './dashboard.models';
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
}
