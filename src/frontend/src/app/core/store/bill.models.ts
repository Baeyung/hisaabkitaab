import { Balance } from './balance.models';

/**
 * Which goods document is being read, and the path segment it is read from:
 * `bills` are SALEs, `purchases` are PURCHASEs. The two share every model below —
 * a purchase is the same paper read from the other side, so `cashReceived` is the
 * cash you paid out and `outstanding` is what you still owe.
 */
export type DocKind = 'bills' | 'purchases';

/** Mirrors the backend `dto/transaction` bill records (GET /api/transactions/{kind}). */
export interface BillSummary {
  id: string;
  billNumber: string | null;
  date: string;
  partyName: string | null;
  amount: number;
  /** Cash that changed hands on it: taken in on a bill, paid out on a purchase. */
  cashReceived: number;
  /** What was knocked off the bill before cash was weighed against it — explicit, entered on the entry screen. */
  discount: number;
  /**
   * The same "on khata" figure the document's own page shows, so the list can say
   * whether `amount` was paid, part-paid, or all on udhaar. Zero on a walk-in — there's
   * no khata to put anything on; `discount` above is a separate figure entirely.
   */
  outstanding: Balance;
}

export interface BillLine {
  itemId: string | null;
  itemName: string | null;
  quantity: number | null;
  unit: string | null;
  rate: number;
  amount: number;
  /**
   * The shop's own entry columns as this line recorded them, or absent for a line written
   * before it had any — which reads as the two default ids off `quantity` and `rate` (see
   * `storedValues`).
   *
   * A saved bill shows the columns it stored, not the ones the shop is arranged with today.
   * Remove a column in settings and a bill from before still reads `3 × 21 × 100 = 6300`
   * rather than `3 × 100 = 6300`, which is a bill whose own arithmetic is visibly wrong — and
   * the printed copy in the customer's hand still says the first thing.
   */
  customFields?: Record<string, number> | null;
}

export interface BillDetail {
  id: string;
  billNumber: string | null;
  date: string;
  description: string | null;
  /** Null on a walk-in cash sale — nobody to put it on a khata for, or to WhatsApp it to. */
  partyId: string | null;
  partyName: string | null;
  partyContact: string | null;
  lines: BillLine[];
  goodsTotal: number;
  cashReceived: number;
  /** What was knocked off the bill before cash was weighed against it — explicit, entered on the entry screen. */
  discount: number;
  outstanding: Balance;
}
