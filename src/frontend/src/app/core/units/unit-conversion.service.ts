import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreService } from '../store/store.service';
import { UnitConversionDraft, UnitConversionRate } from './unit-conversion.models';
import { UnitFactor, resolveFactor } from './units';

/**
 * The shop's answer to "what is one of these worth in one of those" — the fixed table in
 * `units.ts`, plus whatever this shop had to teach us on top of it.
 *
 * Loaded once per store and held here, because every entry screen asks the same question of
 * the same small list and none of them should wait on a request to answer it. {@link load} is
 * idempotent and safe to call from each screen's constructor: the second caller gets the
 * first one's promise rather than a second request.
 *
 * Nothing here converts a quantity. {@link factor} hands back a rate and where it came from,
 * and the conversion slip does the multiplying — in front of the shopkeeper, who has to agree
 * to it before it reaches an entry.
 */
@Injectable({ providedIn: 'root' })
export class UnitConversionService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private readonly _rates = signal<UnitConversionRate[]>([]);
  /** Everything this shop has taught us, newest write last. Read-only to callers. */
  readonly rates = this._rates.asReadonly();

  /** The store the loaded rates belong to — a switch of shop has to drop them, not keep them. */
  private loadedFor: string | null = null;
  private inFlight: Promise<void> | null = null;

  private get url(): string {
    return this.stores.api('unit-conversions');
  }

  /**
   * Fetch this store's rates, once. Concurrent callers share the request, a repeat call for
   * the store already loaded does nothing, and moving to another shop reloads.
   *
   * A failure leaves the list empty rather than throwing: the built-in table still answers
   * every fixed pair, and a shop-specific one falls through to the slip asking. An entry
   * screen must not refuse to open because a lookup table did not arrive.
   */
  load(): Promise<void> {
    const storeId = this.stores.currentId();
    if (!storeId) {
      return Promise.resolve();
    }
    if (this.loadedFor === storeId && !this.inFlight) {
      return Promise.resolve();
    }
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = firstValueFrom(this.http.get<UnitConversionRate[]>(this.url))
      .then((rates) => {
        this._rates.set(rates);
        this.loadedFor = storeId;
      })
      .catch(() => {
        this._rates.set([]);
        this.loadedFor = storeId;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  /**
   * The rate from one unit to another, or null when nobody — table or shopkeeper — has said.
   * Null is the signal for the slip to ask rather than an error to report.
   */
  factor(from: string | null | undefined, to: string | null | undefined): UnitFactor | null {
    return resolveFactor(from, to, this._rates());
  }

  /**
   * Remember a rate the shopkeeper typed. The backend canonicalises the pair, so sending
   * "1 than = 22 metre" and later "1 metre = 0.0454 than" rewrites one row instead of
   * creating a contradiction; the response replaces or joins the local list accordingly.
   *
   * Failing to save is not failing to convert. The entry the shopkeeper is in the middle of
   * has its factor and goes through; all that is lost is being asked once more next time, so
   * the error is swallowed rather than thrown into the middle of a sale.
   */
  async teach(draft: UnitConversionDraft): Promise<void> {
    try {
      const saved = await firstValueFrom(this.http.put<UnitConversionRate>(this.url, draft));
      this._rates.update((rates) => [...rates.filter((r) => r.id !== saved.id), saved]);
    } catch {
      // Left for the next entry to ask about again.
    }
  }
}
