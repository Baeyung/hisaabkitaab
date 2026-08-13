import { StoreRole } from './store.models';

/**
 * Someone in the shop a document can be sent to — the owner, or a user they have shared it
 * with. Mirrors the backend `ShareRecipient`, which leaves out anyone with no number worth
 * messaging, and leaves out the numbers themselves: the send resolves those server-side.
 */
export interface ShareRecipient {
  userId: string;
  name: string;
  role: StoreRole;
  /** They have opted out of this shop's messages. The send refuses them either way. */
  blocked: boolean;
}

/** Everything the send dialog needs to draw itself: the shop's people, and the party's opt-out. */
export interface ShareRecipients {
  people: ShareRecipient[];
  /** False whenever the screen is not about a party — the shop's own printouts. */
  partyBlocked: boolean;
}

/**
 * Who a send goes to, named rather than addressed. A party is the customer a document is
 * about; a user is someone who works in the shop.
 */
export interface ShareTarget {
  kind: 'PARTY' | 'USER';
  id: string;
}

/** What a send actually did — it can reach some of a list and not the rest. */
export interface ShareResult {
  /** How many messages went out. Only these were charged against the owner's quota. */
  sent: number;
  /** The names it did not reach, for the button to say so. */
  failed: string[];
}
