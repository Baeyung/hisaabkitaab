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
   * the error is swallowed rather than thrown into the middle of a sale — callers that only
   * want the conversion to proceed can ignore the returned flag.
   *
   * The Store Settings conversions screen is the one caller that does care, since there a
   * failure is the whole point of the click rather than a footnote to it — it reads the row
   * back — to report a failure, and to spot an edit that moved a rate onto a different pair,
   * which comes back as a different id than the one being edited.
   */
  async teach(draft: UnitConversionDraft): Promise<UnitConversionRate | null> {
    try {
      const saved = await firstValueFrom(this.http.put<UnitConversionRate>(this.url, draft));
      this._rates.update((rates) => [...rates.filter((r) => r.id !== saved.id), saved]);
      return saved;
    } catch {
      return null;
    }
  }

  /**
   * Forget a rate taught by mistake — the pair goes back to having no answer, and the slip
   * asks again the next time an entry needs it. Same swallow-and-report-false shape as
   * {@link teach}: the Store Settings screen is the only caller, and it reads the flag to
   * report the failure rather than pretending the row is gone.
   */
  async delete(id: string): Promise<boolean> {
    try {
      await firstValueFrom(this.http.delete(`${this.url}/${id}`));
      this._rates.update((rates) => rates.filter((r) => r.id !== id));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copy this store's rates into other stores the caller also has a hand in — a shop with
   * five branches teaches its than/bori/roll once rather than five times. Same `PUT`, one
   * call per rate per store, so a store that already has a rate for a pair gets it
   * overwritten rather than duplicated — copying is deliberately not additive.
   *
   * Best-effort per store: one rate failing to save does not stop the rest from trying, and
   * one store failing does not stop the others. Returns the ids that came back with at least
   * one failure, so the caller can say which stores need a retry.
   */
  async copyTo(storeIds: readonly string[]): Promise<string[]> {
    const rates = this._rates();
    const failed: string[] = [];

    await Promise.all(
      storeIds.map(async (id) => {
        const url = this.stores.apiFor(id, 'unit-conversions');
        let ok = true;
        for (const rate of rates) {
          try {
            await firstValueFrom(
              this.http.put(url, {
                fromUnit: rate.fromUnit,
                toUnit: rate.toUnit,
                factor: rate.factor,
              } satisfies UnitConversionDraft),
            );
          } catch {
            ok = false;
          }
        }
        if (!ok) {
          failed.push(id);
        }
      }),
    );

    return failed;
  }
}
