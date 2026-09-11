import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Profit } from './profit.models';
import { StoreService } from './store.service';

/** Profit analysis for the current store over a date window. */
@Injectable({ providedIn: 'root' })
export class ProfitService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  getRange(from: string, to: string): Promise<Profit> {
    return firstValueFrom(
      this.http.get<Profit>(this.stores.api('profit'), { params: { from, to } }),
    );
  }
}
