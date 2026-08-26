import { sumBills, sumSummaries } from './doc-totals';
import { BillDetail, BillSummary } from '../../core/store/bill.models';
import { BalanceDirection } from '../../core/store/balance.models';

function bill(
  goodsTotal: number,
  cashReceived: number,
  direction: BalanceDirection,
  amount: number,
  partyName: string | null,
  discount = 0,
): BillDetail {
  return {
    id: 'b',
    billNumber: null,
    date: '2026-07-25',
    description: null,
    partyId: partyName ? 'p' : null,
    partyName,
    partyContact: null,
    lines: [],
    goodsTotal,
    cashReceived,
    discount,
    outstanding: { direction, amount },
  };
}

function row(
  amount: number,
  cashReceived: number,
  direction: BalanceDirection,
  outstanding: number,
  partyName: string | null,
  discount = 0,
): BillSummary {
  return {
    id: 'b',
    billNumber: null,
    date: '2026-07-25',
    partyName,
    amount,
    cashReceived,
    discount,
    outstanding: { direction, amount: outstanding },
  };
}

describe('sumBills', () => {
  it('adds up sales and cash across the printed range', () => {
    const t = sumBills([
      bill(1000, 1000, 'SETTLED', 0, 'Ahmad'),
      bill(500, 500, 'SETTLED', 0, null),
    ]);
    expect(t).toEqual({ count: 2, revenue: 1500, cash: 1500, khata: 0, discount: 0 });
  });

  it('books a party balance to khata and a walk-in discount separately', () => {
    const t = sumBills([
      bill(1000, 600, 'THEY_OWE_YOU', 400, 'Ahmad'),
      // No party, cash short of the goods by exactly the discount entered on it.
      bill(500, 450, 'SETTLED', 0, null, 50),
    ]);
    expect(t.khata).toBe(400);
    expect(t.discount).toBe(50);
  });

  it('keeps a discount and a khata balance separate on the same party document', () => {
    const t = sumBills([bill(1000, 600, 'THEY_OWE_YOU', 300, 'Ahmad', 100)]);
    expect(t.khata).toBe(300);
    expect(t.discount).toBe(100);
  });

  it('nets an overpaid party bill off the khata total', () => {
    const t = sumBills([
      bill(1000, 600, 'THEY_OWE_YOU', 400, 'Ahmad'),
      bill(1000, 1100, 'YOU_OWE_THEM', 100, 'Bilal'),
    ]);
    expect(t.khata).toBe(300);
  });

  it('is zero for an empty run', () => {
    expect(sumBills([])).toEqual({ count: 0, revenue: 0, cash: 0, khata: 0, discount: 0 });
  });

  // A purchase run is the same arithmetic read from the other side: what is unpaid is
  // money you owe, so it has to total positive there too.
  it('totals an unpaid purchase run positively when owing runs the other way', () => {
    const t = sumBills(
      [
        bill(800, 300, 'YOU_OWE_THEM', 500, 'Bilal Traders'),
        bill(200, 200, 'SETTLED', 0, 'Bilal Traders'),
      ],
      'YOU_OWE_THEM',
    );
    expect(t).toEqual({ count: 2, revenue: 1000, cash: 500, khata: 500, discount: 0 });
  });

  it('nets an overpaid purchase off, and totals a discount taken on a cash purchase', () => {
    const t = sumBills(
      [
        bill(800, 300, 'YOU_OWE_THEM', 500, 'Bilal Traders'),
        // Paid the supplier more than the goods came to — they owe you the difference.
        bill(500, 600, 'THEY_OWE_YOU', 100, 'Rafiq'),
        // No supplier on it, and the shortfall was an entered discount.
        bill(300, 280, 'SETTLED', 0, null, 20),
      ],
      'YOU_OWE_THEM',
    );
    expect(t.khata).toBe(400);
    expect(t.discount).toBe(20);
  });
});

/**
 * The footer under the list on screen. It splits khata from discount by the same rule the
 * printed report does, so the two can never quote different figures for the same range.
 */
describe('sumSummaries', () => {
  it('adds up what the filtered rows come to', () => {
    const t = sumSummaries([
      row(1000, 600, 'THEY_OWE_YOU', 400, 'Ahmad'),
      row(500, 500, 'SETTLED', 0, 'Bilal'),
    ]);
    expect(t).toEqual({ count: 2, amount: 1500, cash: 1100, khata: 400, discount: 0 });
  });

  it('reads a walk-in discount off the row, never as khata', () => {
    const t = sumSummaries([row(500, 450, 'SETTLED', 0, null, 50)]);
    expect(t.khata).toBe(0);
    expect(t.discount).toBe(50);
  });

  it('nets an overpaid bill off the khata total', () => {
    const t = sumSummaries([
      row(1000, 600, 'THEY_OWE_YOU', 400, 'Ahmad'),
      row(1000, 1100, 'YOU_OWE_THEM', 100, 'Bilal'),
    ]);
    expect(t.khata).toBe(300);
  });

  // A purchase run is the same arithmetic from the other side: unpaid is money you owe,
  // so it has to total positive there too.
  it('totals an unpaid purchase run positively when owing runs the other way', () => {
    const t = sumSummaries(
      [
        row(800, 300, 'YOU_OWE_THEM', 500, 'Bilal Traders'),
        row(200, 200, 'SETTLED', 0, 'Bilal Traders'),
      ],
      'YOU_OWE_THEM',
    );
    expect(t).toEqual({ count: 2, amount: 1000, cash: 500, khata: 500, discount: 0 });
  });

  it('is zero for an empty list', () => {
    expect(sumSummaries([])).toEqual({ count: 0, amount: 0, cash: 0, khata: 0, discount: 0 });
  });

  // The row columns and the footer read the same fields, so a run of rows and the same run
  // fetched in full for printing must agree on goods, cash and what is on khata.
  it('agrees with the printed report over the same run', () => {
    const owing = 'THEY_OWE_YOU';
    const summaries = sumSummaries(
      [
        row(1000, 600, 'THEY_OWE_YOU', 400, 'Ahmad'),
        row(500, 450, 'SETTLED', 0, null, 50),
        row(300, 300, 'SETTLED', 0, 'Bilal'),
      ],
      owing,
    );
    const details = sumBills(
      [
        bill(1000, 600, 'THEY_OWE_YOU', 400, 'Ahmad'),
        bill(500, 450, 'SETTLED', 0, null, 50),
        bill(300, 300, 'SETTLED', 0, 'Bilal'),
      ],
      owing,
    );
    expect(summaries.khata).toBe(details.khata);
    expect(summaries.discount).toBe(details.discount);
    expect(summaries.amount).toBe(details.revenue);
    expect(summaries.cash).toBe(details.cash);
  });

  // Goods = cash + khata + discount, per row and therefore over the run — true even on a
  // document that carries both a khata balance and a discount at once. If that ever fails
  // the columns are telling a shopkeeper numbers that don't reconcile.
  it('leaves goods fully accounted for by cash, khata and discount', () => {
    const t = sumSummaries([
      row(1000, 600, 'THEY_OWE_YOU', 400, 'Ahmad'),
      row(500, 450, 'SETTLED', 0, null, 50),
      row(300, 300, 'SETTLED', 0, 'Bilal'),
      // Combination: a khata party given a discount too.
      row(800, 500, 'THEY_OWE_YOU', 200, 'Rafiq', 100),
    ]);
    expect(t.cash + t.khata + t.discount).toBe(t.amount);
  });
});
