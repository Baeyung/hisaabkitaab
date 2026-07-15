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
}

/** The editable shape sent on create/update — everything but the server `id`. */
export type StoreItemDraft = Omit<StoreItem, 'id'>;
