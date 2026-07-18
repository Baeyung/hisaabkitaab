import { Balance } from './balance.models';

/**
 * A party in the user's store — a customer or supplier they keep a khata with.
 * Mirrors the backend `PartyResponse`; `store` is server-side only (derived from
 * the owner's primary store). Contact and address are optional free text.
 * `openingBalance` is the amount they carried in at onboarding, `null` when none
 * is set (only present on the list; create/update responses omit it).
 */
export interface Party {
  id: string;
  name: string;
  contact: string | null;
  address: string | null;
  openingBalance?: Balance | null;
}

/** The editable shape sent on create/update — the free-text fields only. */
export type PartyDraft = Omit<Party, 'id' | 'openingBalance'>;

/** Which way a party's opening balance points — never SETTLED (a zero opening clears it). */
export type OpeningDirection = 'THEY_OWE_YOU' | 'YOU_OWE_THEM';

/** Set a party's opening balance: the amount carried in and its direction. */
export interface OpeningBalanceDraft {
  amount: number;
  direction: OpeningDirection;
}
