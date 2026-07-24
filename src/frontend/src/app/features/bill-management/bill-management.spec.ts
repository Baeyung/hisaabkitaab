import { sumBills } from './bill-management';
import { BillDetail } from '../../core/store/bill.models';
import { BalanceDirection } from '../../core/store/balance.models';

function bill(
  goodsTotal: number,
  cashReceived: number,
  direction: BalanceDirection,
  amount: number,
  partyName: string | null,
): BillDetail {
  return {
    id: 'b',
    billNumber: null,
    date: '2026-07-25',
    description: null,
    partyName,
    lines: [],
    goodsTotal,
    cashReceived,
    outstanding: { direction, amount },
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

  it('books an unpaid party bill to khata and an unbalanced cash sale to discount', () => {
    const t = sumBills([
      bill(1000, 600, 'THEY_OWE_YOU', 400, 'Ahmad'),
      bill(500, 450, 'THEY_OWE_YOU', 50, null),
    ]);
    expect(t.khata).toBe(400);
    expect(t.discount).toBe(50);
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
});
