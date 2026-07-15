/**
 * A shop the signed-in user owns. Mirrors the backend `Store` entity; `owner`
 * is server-side only (JSON-ignored). `logoUri` / `watermarkUri` currently hold
 * a base64 data URI (see docs/tickets/HK-store-media-object-storage.md).
 */
export interface Store {
  id: string;
  name: string;
  address: string;
  contact: string;
  logoUri: string;
  watermarkUri: string;
}

/** The editable shape sent on create/update — everything but the server `id`. */
export type StoreDraft = Omit<Store, 'id'>;
