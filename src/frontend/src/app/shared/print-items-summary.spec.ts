import { sumItems } from './print-items-summary';
import { BillDetail, BillLine } from '../core/store/bill.models';

function bill(...lines: Partial<BillLine>[]): BillDetail {
  return {
    id: 'b',
    billNumber: null,
    date: '2026-07-25',
    description: null,
    partyId: null,
    partyName: null,
    partyContact: null,
    lines: lines.map((l) => ({
      itemId: null,
      itemName: null,
      quantity: null,
      unit: null,
      rate: 0,
      amount: 0,
      ...l,
    })),
    goodsTotal: 0,
    cashReceived: 0,
    outstanding: { direction: 'SETTLED', amount: 0 },
  };
}

describe('sumItems', () => {
  it('adds up an item across bills, biggest earner first', () => {
    const rows = sumItems([
      bill(
        { itemId: 'i1', itemName: 'Sugar', quantity: 2, unit: 'kg', amount: 600 },
        { itemId: 'i2', itemName: 'Tea', quantity: 1, unit: 'kg', amount: 800 },
      ),
      bill({ itemId: 'i1', itemName: 'Sugar', quantity: 3, unit: 'kg', amount: 900 }),
    ]);
    expect(rows).toEqual([
      { name: 'Sugar', unit: 'kg', quantity: 5, amount: 1500 },
      { name: 'Tea', unit: 'kg', quantity: 1, amount: 800 },
    ]);
  });

  it('keeps the same item split by unit — kg and bags cannot be added', () => {
    const rows = sumItems([
      bill(
        { itemId: 'i1', itemName: 'Rice', quantity: 5, unit: 'kg', amount: 500 },
        { itemId: 'i1', itemName: 'Rice', quantity: 2, unit: 'bag', amount: 4000 },
      ),
    ]);
    expect(rows.map((r) => [r.unit, r.quantity])).toEqual([
      ['bag', 2],
      ['kg', 5],
    ]);
  });

  it('counts a quantity-less line towards the amount only', () => {
    const rows = sumItems([bill({ itemName: 'Repair charge', amount: 250 })]);
    expect(rows).toEqual([{ name: 'Repair charge', unit: null, quantity: 0, amount: 250 }]);
  });

  it('groups unnamed lines under one row and is empty for no bills', () => {
    expect(sumItems([])).toEqual([]);
    expect(sumItems([bill({ amount: 10 }, { amount: 5 })])).toEqual([
      { name: '—', unit: null, quantity: 0, amount: 15 },
    ]);
  });
});
