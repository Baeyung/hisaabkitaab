/**
 * The rates this shop has taught us. Mirrors the backend `dto/units`
 * (`/api/stores/{storeId}/unit-conversions`).
 *
 * Only the ones no table could know — a than, a bori, a roll. Everything with a fixed answer
 * is in `core/units/units.ts`, identical in every shop.
 */
export interface UnitConversionRate {
  id: string;
  /** Folded (trimmed, lower-cased) by the backend — key material, never display text. */
  fromUnit: string;
  toUnit: string;
  /** How many `toUnit` one `fromUnit` makes. Always positive. */
  factor: number;
}

/** What the shop sends to teach or correct a rate; the backend canonicalises the pair. */
export interface UnitConversionDraft {
  fromUnit: string;
  toUnit: string;
  factor: number;
}
