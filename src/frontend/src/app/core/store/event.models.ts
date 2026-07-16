/**
 * The transaction-entry contract sent to `POST /api/event`. Mirrors the backend
 * `EventRequest`: the shopkeeper records one business event (a sale, a receipt…)
 * and the backend fans it out into the accounting sides.
 *
 * Party/item ids are optional: when the typed name matches an existing record we
 * send its id, otherwise we send the name only and the backend resolves (or, for
 * parties, will later create) it. `billDate` is an ISO `yyyy-MM-dd` string.
 */
export interface EventRequest {
  transactionEvent: 'SALE' | 'PURCHASE' | 'RECEIPT' | 'PAYMENT' | 'EXPENSE' | 'ADJUSTMENT';
  cashAmount: number | null;
  billAmount: number | null;
  description: string | null;
  billNumber: string | null;
  billDate: string | null;
  party: EventParty | null;
  items: EventItem[];
}

/** A party on the event — `partyId` null when the typed name is new. */
export interface EventParty {
  partyId: string | null;
  name: string;
}

/** A line of goods on the bill — `itemId` null when the typed name is new. */
export interface EventItem {
  itemId: string | null;
  name: string;
  quantity: number;
  itemSoldAt: number;
}
