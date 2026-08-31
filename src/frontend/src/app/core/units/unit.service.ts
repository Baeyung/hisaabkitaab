import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreService } from '../store/store.service';

/** One unit name on this store's list, as the Units screen manages it. */
export interface Unit {
  id: string;
  name: string;
}

/**
 * The current store's units — the autocomplete source for every entry screen's unit box, and
 * the backing list for the Units screen's Manage Units section. Seeded with the same defaults
 * {@link UNIT_SUGGESTIONS} lists, plus whatever this shop has since typed on an item or a
 * conversion rate (see `UnitService#resolveOrCreate` on the backend), so a shop's own trade
 * units show up here too rather than only on the Units screen.
 */
@Injectable({ providedIn: 'root' })
export class UnitService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('units');
  }

  /** Every unit this store has, id and name, alphabetical. */
  list(): Promise<Unit[]> {
    return firstValueFrom(this.http.get<Unit[]>(this.url));
  }

  /** Unit names only — what every entry screen's box offers as suggestions. */
  async names(): Promise<string[]> {
    return (await this.list()).map((u) => u.name);
  }

  /** Renames a unit; the backend refuses (409) a name another unit of this store already has,
   *  case-insensitively. */
  rename(id: string, name: string): Promise<Unit> {
    return firstValueFrom(this.http.patch<Unit>(`${this.url}/${id}`, { name }));
  }

  /** Drops a unit from this store's list. Anything already recorded under its name — an item,
   *  a transaction line, a conversion rate — keeps that text; only the suggestion goes. */
  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
  }
}
