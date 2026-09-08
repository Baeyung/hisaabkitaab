import { footedTotals } from './bill-invoice';
import { BillLine } from '../core/store/bill.models';

function line(customFields: Record<string, number> | null): BillLine {
  return { itemId: null, itemName: null, quantity: null, unit: null, rate: 0, amount: 0, customFields };
}

describe('footedTotals', () => {
  const fields = [
    { id: 'thans', label: 'Thans', showTotal: true },
    { id: 'rate', label: 'Rate' },
  ];

  it('adds a footed column down the bill', () => {
    const rows = footedTotals(fields, [line({ thans: 10, rate: 5 }), line({ thans: 5, rate: 5 })]);
    expect(rows).toEqual([{ label: 'Thans', value: 15 }]);
  });

  it('leaves out a column no line recorded', () => {
    expect(footedTotals(fields, [line(null), line({ rate: 5 })])).toEqual([]);
  });
});
