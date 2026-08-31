import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreService } from '../store/store.service';

/**
 * The current store's unit names — the autocomplete source for every entry screen's unit box.
 * Seeded with the same defaults {@link UNIT_SUGGESTIONS} lists, plus whatever this shop has
 * since typed on an item or a conversion rate (see `UnitService#resolveOrCreate` on the
 * backend), so a shop's own trade units show up here too rather than only on the Units screen.
 */
@Injectable({ providedIn: 'root' })
export class UnitService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('units');
  }

  /** Unit names, alphabetical. */
  names(): Promise<string[]> {
    return firstValueFrom(this.http.get<string[]>(this.url));
  }
}
