import {
  CustomFieldsSettings,
  DEFAULT_CUSTOM_FIELDS,
  DEFAULT_QTY_FIELD,
  DEFAULT_RATE_FIELD,
  compileArrangement,
  resolveValues,
  storedValues,
} from './custom-field.models';
import { evaluate } from './formula';

/** The worked example: a shop that counts cloth in thans of so many gaz. */
const CLOTH: CustomFieldsSettings = {
  fields: [
    { id: 'thans', label: 'Thans' },
    { id: 'gazana', label: 'Gazana' },
    { id: 'rate', label: 'Rate' },
  ],
  showUnit: false,
  total: 'thans * gazana * rate',
  shelfQty: 'thans * gazana',
  rateField: 'rate',
};

describe('compileArrangement', () => {
  it('gives a shop that has arranged nothing the grid the app ships with', () => {
    const a = compileArrangement(undefined);
    expect(a.isDefault).toBe(true);
    expect(a.settings.fields.map((f) => f.id)).toEqual([DEFAULT_QTY_FIELD, DEFAULT_RATE_FIELD]);
    expect(a.settings.showUnit).toBe(true);
  });

  it('reproduces today’s arithmetic exactly on that default grid', () => {
    const a = compileArrangement(null);
    const values = { qty: 5, rate: 2100 };
    expect(evaluate(a.total, values)).toBe(10500);
    expect(evaluate(a.shelfQty, values)).toBe(5);
  });

  it('falls back to the built-in grid rather than leaving the screen with no columns', () => {
    // A document written by another build, naming a column that is not there.
    const broken = { ...CLOTH, total: 'thans * missing' };
    expect(compileArrangement(broken).isDefault).toBe(true);
  });

  it('separates the columns that are typed into from the ones worked out', () => {
    const a = compileArrangement({
      ...CLOTH,
      fields: [...CLOTH.fields, { id: 'gaz', label: 'Total gaz', formula: 'thans * gazana' }],
    });
    expect(a.typed.map((f) => f.id)).toEqual(['thans', 'gazana', 'rate']);
    expect(a.computed.map((c) => c.field.id)).toEqual(['gaz']);
  });
});

describe('conversion eligibility', () => {
  it('is on for the built-in grid, which is why nothing changes for existing shops', () => {
    const a = compileArrangement(undefined);
    expect(a.shelfField).toBe(DEFAULT_QTY_FIELD);
    expect(a.convertible).toBe(true);
  });

  it('is off when the shelf quantity is worked out from several columns', () => {
    // There is no single column to scale up and no unambiguous one to scale down, so a
    // converted line could not be stored in a way that reopens to the same quantity.
    const a = compileArrangement(CLOTH);
    expect(a.shelfField).toBeNull();
    expect(a.convertible).toBe(false);
  });

  it('is on when the shelf quantity is one typed column beside a separate rate', () => {
    const a = compileArrangement({ ...CLOTH, shelfQty: 'gazana' });
    expect(a.shelfField).toBe('gazana');
    expect(a.convertible).toBe(true);
  });

  it('is off when the shelf column is itself worked out', () => {
    const a = compileArrangement({
      ...CLOTH,
      fields: [...CLOTH.fields, { id: 'gaz', label: 'Gaz', formula: 'thans * gazana' }],
      shelfQty: 'gaz',
    });
    expect(a.convertible).toBe(false);
  });

  it('is off when the rate column is the shelf column, or is missing', () => {
    expect(compileArrangement({ ...CLOTH, shelfQty: 'rate' }).convertible).toBe(false);
    expect(
      compileArrangement({ ...CLOTH, shelfQty: 'gazana', rateField: undefined }).convertible,
    ).toBe(false);
  });
});

describe('resolveValues', () => {
  it('fills in a computed column from what was typed', () => {
    const a = compileArrangement({
      ...CLOTH,
      fields: [...CLOTH.fields, { id: 'gaz', label: 'Gaz', formula: 'thans * gazana' }],
    });
    expect(resolveValues(a, { thans: 3, gazana: 21, rate: 100 })['gaz']).toBe(63);
  });

  it('lets one computed column read another', () => {
    const a = compileArrangement({
      ...CLOTH,
      fields: [
        ...CLOTH.fields,
        { id: 'gaz', label: 'Gaz', formula: 'thans * gazana' },
        { id: 'net', label: 'Net', formula: 'gaz * rate' },
      ],
    });
    expect(resolveValues(a, { thans: 3, gazana: 21, rate: 100 })['net']).toBe(6300);
  });
});

describe('the numbers a line posts', () => {
  // The contract every read of a saved bill depends on: DocumentTotals.goods() recomputes
  // the total as Σ(quantity × itemSoldAt), so those two must multiply back to what the
  // shopkeeper agreed to. This is that sum, done the way goods-entry does it.
  const posted = (settings: CustomFieldsSettings, typed: Record<string, number>) => {
    const a = compileArrangement(settings);
    const values = resolveValues(a, typed);
    const amount = evaluate(a.total, values);
    const quantity = evaluate(a.shelfQty, values);
    return { quantity, itemSoldAt: quantity > 0 ? amount / quantity : 0, amount };
  };

  it('multiplies back to the line total on the shop’s own columns', () => {
    const line = posted(CLOTH, { thans: 3, gazana: 21, rate: 100 });
    expect(line.quantity).toBe(63);
    expect(line.itemSoldAt).toBe(100);
    expect(line.quantity * line.itemSoldAt).toBe(line.amount);
  });

  it('multiplies back on the built-in grid too — the rate as typed', () => {
    const line = posted(DEFAULT_CUSTOM_FIELDS, { qty: 5, rate: 2100 });
    expect(line.quantity).toBe(5);
    expect(line.itemSoldAt).toBe(2100);
    expect(line.quantity * line.itemSoldAt).toBe(10500);
  });

  it('multiplies back when the division does not come out round', () => {
    const line = posted(CLOTH, { thans: 3, gazana: 7, rate: 33.33 });
    expect(line.quantity * line.itemSoldAt).toBeCloseTo(line.amount, 9);
  });
});

describe('storedValues', () => {
  it('reads a line written before the shop had columns as the two it always had', () => {
    expect(storedValues(null, 63, 100)).toEqual({ qty: 63, rate: 100 });
    expect(storedValues(undefined, 63, 100)).toEqual({ qty: 63, rate: 100 });
    expect(storedValues({}, 63, 100)).toEqual({ qty: 63, rate: 100 });
  });

  it('reads a line that recorded its own columns as those', () => {
    expect(storedValues({ thans: 3, gazana: 21, rate: 100 }, 63, 100)).toEqual({
      thans: 3,
      gazana: 21,
      rate: 100,
    });
  });

  it('keeps the columns in the order they were written in', () => {
    // The invoice renders them in this order, and a JSON object preserves it.
    expect(Object.keys(storedValues({ thans: 3, gazana: 21, rate: 100 }, 63, 100))).toEqual([
      'thans',
      'gazana',
      'rate',
    ]);
  });
});
