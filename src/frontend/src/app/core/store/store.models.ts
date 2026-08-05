/**
 * What a user may do in one shop. `OWNER` is the shop's creator; the other two are
 * granted from Store Settings › Manage Users. Mirrors the backend `StoreRole` — the
 * backend refuses anything above the caller's role regardless of what the UI shows,
 * so these are for hiding controls, never for enforcing anything.
 */
export type StoreRole = 'VIEWER' | 'EDITOR' | 'OWNER';

/**
 * A shop the signed-in user can reach — their own, or one shared with them. Mirrors the
 * backend `StoreSummary`. `logoUri` / `watermarkUri` currently hold a base64 data URI
 * (see docs/tickets/HK-store-media-object-storage.md).
 */
export interface Store {
  id: string;
  name: string;
  address: string;
  contact: string;
  logoUri: string;
  watermarkUri: string;
  /** This user's role in this shop, not the shop's own property. */
  role: StoreRole;
  /** Whose shop it is — shown on shared shops ("Shared by …"). */
  ownerName: string;
}

/** The editable shape sent on create/update: the shop's own fields, nothing about who is asking. */
export type StoreDraft = Omit<Store, 'id' | 'role' | 'ownerName'>;
