import { footedTotals, groupLines, invoiceColumns } from './bill-invoice';
import { BillLine } from '../core/store/bill.models';

function line(customFields: Record<string, number> | null, item?: Partial<BillLine>): BillLine {
  return { itemId: null, itemName: null, quantity: null, unit: null, rate: 0, amount: 0, customFields, ...item };
}

describe('footedTotals', () => {
  const fields = [
    { id: 'thans', label: 'Thans', showTotal: true },
    { id: 'rate', label: 'Rate' },
  ];

  it('adds a footed column down the bill', () => {
    const rows = footedTotals(fields, [line({ thans: 10, rate: 5 }), line({ thans: 5, rate: 5 })]);
    expect(rows).toEqual([{ id: 'thans', label: 'Thans', value: 15 }]);
  });

  it('leaves out a column no line recorded', () => {
    expect(footedTotals(fields, [line(null), line({ rate: 5 })])).toEqual([]);
  });
});

describe('groupLines', () => {
  const fields = [{ id: 'thans', label: 'Thans', showTotal: true }];
  const a1 = line({ thans: 3 }, { itemId: 'a', itemName: 'Item A' });
  const b1 = line({ thans: 4 }, { itemId: 'b', itemName: 'Item B' });
  const a2 = line({ thans: 7 }, { itemId: 'a', itemName: 'Item A' });

  it(`gathers an item's lines where it was first written, and foots its columns`, () => {
    const groups = groupLines([a1, b1, a2], fields);
    expect(groups.map((g) => g.name)).toEqual(['Item A', 'Item B']);
    expect(groups[0].lines).toEqual([a1, a2]);
    expect(groups[0].totals).toEqual([{ id: 'thans', label: 'Thans', value: 10 }]);
  });

  it('leaves an item that took one line unfooted', () => {
    expect(groupLines([a1, b1], fields)[1].totals).toEqual([]);
  });

  it('gathers free-text lines on their name, and keeps different names apart', () => {
    const groups = groupLines([line(null, { itemName: 'Cloth' }), line(null, { itemName: 'Silk' }), line(null, { itemName: 'Cloth' })]);
    expect(groups.map((g) => [g.name, g.lines.length])).toEqual([['Cloth', 2], ['Silk', 1]]);
  });
});

describe('invoiceColumns', () => {
  const fields = [
    { id: 'thans', label: 'Thans' },
    { id: 'rate', label: 'Rate' },
  ];
  const defaults = (id: string) => (id === 'qty' ? 'Qty' : 'Rate');

  it('lists the columns in the order the lines recorded them, named by the arrangement', () => {
    const cols = invoiceColumns([line({ thans: 10, rate: 315 })], fields, defaults);
    expect(cols).toEqual([
      { id: 'thans', label: 'Thans' },
      { id: 'rate', label: 'Rate' },
    ]);
  });

  it('reads a line written before the shop had columns as quantity and rate', () => {
    expect(invoiceColumns([line(null, { quantity: 63, rate: 100 })], fields, defaults)).toEqual([
      { id: 'qty', label: 'Qty' },
      { id: 'rate', label: 'Rate' },
    ]);
  });

  it('keeps a column the shop has since removed, under its own id', () => {
    const cols = invoiceColumns([line({ gazana: 21, rate: 100 })], fields, defaults);
    expect(cols[0]).toEqual({ id: 'gazana', label: 'gazana' });
  });

  it('gathers every column any line recorded, once', () => {
    const cols = invoiceColumns([line({ thans: 1 }), line({ thans: 2, rate: 5 })], fields, defaults);
    expect(cols.map((c) => c.id)).toEqual(['thans', 'rate']);
  });
});
