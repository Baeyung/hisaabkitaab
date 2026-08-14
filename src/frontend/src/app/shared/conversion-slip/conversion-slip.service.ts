import { Injectable, inject, signal } from '@angular/core';
import { UnitConversionService } from '../../core/units/unit-conversion.service';
import { FactorSource } from '../../core/units/units';

/** What the slip is being asked about: one row, its two units, and the quantity on it. */
export interface ConversionAsk {
  /** The row's item, so the slip is about a thing on a shelf and not two abstract units. */
  itemName: string;
  /** The unit the shopkeeper entered in. */
  from: string;
  /** The unit this item's stock is counted in — what the quantity has to become. */
  to: string;
  /** The quantity as typed, in `from`. Null while the box is still empty. */
  qty: number | null;
}

/**
 * What the shopkeeper decided. `null` is a cancel, and callers treat it as "put the unit box
 * back where it was" — an entry must never be left holding a quantity in a unit the shelf does
 * not count in.
 */
export interface ConversionAnswer {
  /** Multiply the entered quantity by this to get the quantity to save. */
  factor: number;
  source: FactorSource;
}

/**
 * The one conversion slip, opened from wherever a row's unit stops matching the unit its item
 * is stocked in — a sale, a purchase, a processing batch, an opening stock.
 *
 * The same promise-and-signal shape as {@link import('../print-details.service').PrintDetailsService}:
 * one dialog mounted in the shell, this service holds the question and resolves the answer, so
 * the screens stay free of dialog plumbing and there is only ever one on screen.
 *
 * Teaching is folded in here rather than left to callers. A rate the shopkeeper typed is worth
 * keeping and every caller would otherwise have to remember to keep it — so {@link answer}
 * writes it to the shop before resolving, and the screens only ever see a factor.
 */
@Injectable({ providedIn: 'root' })
export class ConversionSlipService {
  private readonly conversions = inject(UnitConversionService);

  /** Non-null while the slip is open; the dialog renders from it. */
  readonly ask = signal<ConversionAsk | null>(null);
  private resolve: ((answer: ConversionAnswer | null) => void) | null = null;

  /**
   * Open the slip and wait for the shopkeeper.
   *
   * Resolves immediately — without showing anything — when the two units are the same or
   * either is blank, so callers can hand over any pair of units without checking first. An
   * item with no unit set has nothing to convert to, and a factor of 1 leaves the quantity
   * exactly as typed.
   */
  open(ask: ConversionAsk): Promise<ConversionAnswer | null> {
    const from = ask.from.trim();
    const to = ask.to.trim();
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) {
      return Promise.resolve({ factor: 1, source: 'standard' });
    }

    this.ask.set({ ...ask, from, to });
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /**
   * Called by the dialog. A factor with `remember` set is written to the shop's rates before
   * the caller is released, so the next row of the same entry already finds it and does not ask
   * the same question twice; the write is best-effort, so a failure costs one extra question
   * rather than the entry.
   *
   * The question is cleared first, before the await. Teaching a rate updates the list the open
   * dialog reads its suggestion from, and leaving it open across that would have it reset the
   * box it is in the middle of being dismissed from.
   */
  async answer(answer: ConversionAnswer | null, remember: boolean): Promise<void> {
    const ask = this.ask();
    this.ask.set(null);

    if (answer && remember && ask) {
      await this.conversions.teach({
        fromUnit: ask.from,
        toUnit: ask.to,
        factor: answer.factor,
      });
    }

    this.resolve?.(answer);
    this.resolve = null;
  }
}
