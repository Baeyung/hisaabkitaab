/**
 * An item in the user's store catalog — the cloth they stock and sell. Mirrors
 * the backend `StoreItem`; `store` is server-side only (derived from the owner's
 * primary store). Prices are BigDecimal on the backend, plain numbers on the wire.
 */
export interface StoreItem {
  id: string;
  name: string;
  unit: string | null;
  salePrice: number | null;
  costPrice: number | null;
  /** Opening stock on hand at onboarding; `null` when none is set (list only). */
  openingStock?: number | null;
}

/** The editable shape sent on create/update — the catalog fields only. */
export type StoreItemDraft = Omit<StoreItem, 'id' | 'openingStock'>;
