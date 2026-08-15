import { BalanceDirection } from '../../core/store/balance.models';
import { BillDetail } from '../../core/store/bill.models';

/** The direction an *unpaid* document of a kind leaves the party balance in. */
export type OwingDirection = Exclude<BalanceDirection, 'SETTLED'>;

/**
 * What a printed run of documents adds up to — the report's footer line.
 *
 * The two events are arithmetic mirrors, so `owing` says which way this run's khata
 * runs and the totals come out positive either way: on a bill an unpaid balance is
 * money owed to you, on a purchase it is money you owe the supplier. Anything
 * pointing the other way is an overpayment, and nets off. A document with nobody on
 * it that doesn't balance is a discount, not a khata entry — a discount you gave on
 * a sale, or one you were given on a purchase.
 */
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
    if (b.outstanding.direction === 'SETTLED') {
      continue;
    }
    if (!b.partyName) {
      totals.discount += b.outstanding.amount;
    } else {
      totals.khata += b.outstanding.direction === owing ? b.outstanding.amount : -b.outstanding.amount;
    }
  }
  return totals;
}
