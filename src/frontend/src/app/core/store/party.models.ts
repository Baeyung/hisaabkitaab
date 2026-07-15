/**
 * A party in the user's store — a customer or supplier they keep a khata with.
 * Mirrors the backend `Party`; `store` is server-side only (derived from the
 * owner's primary store). Contact and address are optional free text.
 */
export interface Party {
  id: string;
  name: string;
  contact: string | null;
  address: string | null;
}

/** The editable shape sent on create/update — everything but the server `id`. */
export type PartyDraft = Omit<Party, 'id'>;
