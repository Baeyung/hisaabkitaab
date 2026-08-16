import { Balance, BalanceDirection } from '../../core/store/balance.models';
import { BillDetail, BillSummary } from '../../core/store/bill.models';

/** The direction an *unpaid* document of a kind leaves the party balance in. */
export type OwingDirection = Exclude<BalanceDirection, 'SETTLED'>;

/** The two ways a document can fail to balance, told apart by whether anyone is on it. */
interface Remainder {
  khata: number;
  discount: number;
}

/**
 * What one document left unbalanced, split the way every screen reads it.
 *
 * The two events are arithmetic mirrors, so `owing` says which way this kind's khata
 * runs and the khata figure comes out positive either way: on a bill an unpaid balance
 * is money owed to you, on a purchase it is money you owe the supplier. Anything
 * pointing the other way is an overpayment, and nets off. A document with nobody on it
 * that doesn't balance is a discount, not a khata entry — one you gave on a sale, or
 * one you were given on a purchase.
 *
 * The list column, the printed footer and the document itself all come through here, so
 * a row's "on khata" can never disagree with the total underneath it.
 */
export function splitRemainder(
  doc: { partyName: string | null; outstanding: Balance },
  owing: OwingDirection,
): Remainder {
  if (doc.outstanding.direction === 'SETTLED') {
    return { khata: 0, discount: 0 };
  }
  if (!doc.partyName) {
    return { khata: 0, discount: doc.outstanding.amount };
  }
  const signed =
    doc.outstanding.direction === owing ? doc.outstanding.amount : -doc.outstanding.amount;
  return { khata: signed, discount: 0 };
}

/** What a printed run of documents adds up to — the report's footer line. */
export function sumBills(
  bills: BillDetail[],
  owing: OwingDirection = 'THEY_OWE_YOU',
): {
  count: number;
  revenue: number;
  cash: number;
  khata: number;
  discount: number;
} {
  const totals = { count: bills.length, revenue: 0, cash: 0, khata: 0, discount: 0 };
  for (const b of bills) {
    totals.revenue += b.goodsTotal;
    totals.cash += b.cashReceived;
    const { khata, discount } = splitRemainder(b, owing);
    totals.khata += khata;
    totals.discount += discount;
  }
  return totals;
}

/**
 * The same totals from the list's own rows — what the shopkeeper is looking at right now,
 * without the round-trip Print makes for full details. Cash isn't in a summary row, so it
 * isn't here; the footer states what it can stand behind.
 */
export function sumSummaries(
  bills: BillSummary[],
  owing: OwingDirection = 'THEY_OWE_YOU',
): {
  count: number;
  amount: number;
  khata: number;
  discount: number;
} {
  const totals = { count: bills.length, amount: 0, khata: 0, discount: 0 };
  for (const b of bills) {
    totals.amount += b.amount;
    const { khata, discount } = splitRemainder(b, owing);
    totals.khata += khata;
    totals.discount += discount;
  }
  return totals;
}
