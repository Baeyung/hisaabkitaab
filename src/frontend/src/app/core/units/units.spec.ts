import {
  TaughtRate,
  builtInFactor,
  convertQty,
  foldUnit,
  formatFactor,
  isKnownUnit,
  resolveFactor,
  sameUnit,
  unitDimension,
} from './units';

/** The rate the worked example in the brief turns on: a shop buying greige by the metre. */
const THAN_TO_METRE: TaughtRate = { fromUnit: 'than', toUnit: 'meter', factor: 22 };

describe('foldUnit', () => {
  it('trims and lower-cases, so one unit is one unit', () => {
    expect(foldUnit(' METER ')).toBe('meter');
    expect(foldUnit('Gaz')).toBe('gaz');
    expect(foldUnit(null)).toBe('');
    expect(foldUnit(undefined)).toBe('');
  });
});

describe('sameUnit', () => {
  it('ignores case and surrounding space', () => {
    expect(sameUnit('Meter', ' meter')).toBe(true);
  });

  it('treats blank as unknown rather than as a unit', () => {
    // An item with no unit set must never look like it matches another blank one, or a row
    // would silently skip the conversion it needed.
    expect(sameUnit('', '')).toBe(false);
    expect(sameUnit(null, undefined)).toBe(false);
  });
});

describe('builtInFactor', () => {
  it('knows a gaz is a yard: 36 inches exactly', () => {
    expect(builtInFactor('gaz', 'meter')).toBe(0.9144);
    expect(builtInFactor('yard', 'gaz')).toBe(1);
    expect(builtInFactor('gaz', 'inch')).toBeCloseTo(36, 10);
  });

  it('converts within weight and count', () => {
    expect(builtInFactor('kg', 'gram')).toBeCloseTo(1000, 9);
    expect(builtInFactor('maund', 'kg')).toBeCloseTo(40, 9);
    expect(builtInFactor('dozen', 'piece')).toBeCloseTo(12, 9);
  });

  it('refuses to cross families', () => {
    // "A metre of this cloth weighs 120 grams" is a fact about the cloth, not the units.
    expect(builtInFactor('meter', 'kg')).toBeNull();
  });

  it('has no opinion on a trade unit', () => {
    expect(builtInFactor('than', 'meter')).toBeNull();
    expect(builtInFactor('roll', 'gaz')).toBeNull();
    expect(isKnownUnit('than')).toBe(false);
    expect(isKnownUnit('Meter')).toBe(true);
  });

  it('round-trips', () => {
    const there = builtInFactor('gaz', 'meter')!;
    const back = builtInFactor('meter', 'gaz')!;
    expect(there * back).toBeCloseTo(1, 12);
  });
});

describe('unitDimension', () => {
  it('names the family, or nothing for a trade unit', () => {
    expect(unitDimension('gaz')).toBe('length');
    expect(unitDimension('tola')).toBe('weight');
    expect(unitDimension('ml')).toBe('volume');
    expect(unitDimension('dozen')).toBe('count');
    expect(unitDimension('bori')).toBeNull();
  });
});

describe('convertQty', () => {
  it('rounds to the two places the shelf stores', () => {
    // transaction_lines.quantity is numeric(38,2): rounding here is what makes the figure the
    // shopkeeper approved the figure that lands in stock.
    expect(convertQty(120, 0.9144)).toBe(109.73);
    expect(convertQty(1, 1 / 3)).toBe(0.33);
  });

  it('leaves a quantity alone at a rate of 1', () => {
    expect(convertQty(40.5, 1)).toBe(40.5);
  });
});

describe('resolveFactor', () => {
  it('is 1 for a unit against itself, whatever the case', () => {
    expect(resolveFactor('Meter', 'meter')?.value).toBe(1);
  });

  it('answers nothing when either side is blank', () => {
    expect(resolveFactor('', 'meter')).toBeNull();
    expect(resolveFactor('meter', null)).toBeNull();
  });

  it('uses the fixed table when both are measures', () => {
    const factor = resolveFactor('gaz', 'meter');
    expect(factor?.value).toBe(0.9144);
    expect(factor?.source).toBe('standard');
  });

  it("lets the shop's own rate beat the table for the same pair", () => {
    // Their cloth, their gaz.
    const factor = resolveFactor('gaz', 'meter', [
      { fromUnit: 'gaz', toUnit: 'meter', factor: 0.91 },
    ]);
    expect(factor?.value).toBe(0.91);
    expect(factor?.source).toBe('shop');
  });

  it('reads a taught rate backwards by inverting it', () => {
    const factor = resolveFactor('meter', 'than', [THAN_TO_METRE]);
    expect(factor?.source).toBe('shop');
    expect(factor?.value).toBeCloseTo(1 / 22, 12);
  });

  it('chains a taught rate into the fixed table', () => {
    // Taught "1 than = 22 metre"; asked than → gaz, which nobody typed.
    const factor = resolveFactor('than', 'gaz', [THAN_TO_METRE]);
    expect(factor?.source).toBe('derived');
    expect(factor?.value).toBeCloseTo(22 / 0.9144, 9);
    expect(factor?.via).toEqual(['than', 'meter', 'gaz']);
  });

  it('chains two taught rates through a shared unit', () => {
    const factor = resolveFactor('than', 'bori', [
      THAN_TO_METRE,
      { fromUnit: 'bori', toUnit: 'meter', factor: 11 },
    ]);
    expect(factor?.value).toBeCloseTo(2, 9);
  });

  it('gives up rather than guessing across families', () => {
    // Null is the right answer here, not an error: it is what makes the slip ask.
    expect(resolveFactor('meter', 'kg')).toBeNull();
    expect(resolveFactor('carton', 'kg', [THAN_TO_METRE])).toBeNull();
  });

  it('ignores a nonsense taught rate instead of dividing by it', () => {
    const rates: TaughtRate[] = [{ fromUnit: 'than', toUnit: 'meter', factor: 0 }];
    expect(resolveFactor('than', 'gaz', rates)).toBeNull();
  });
});

describe('formatFactor', () => {
  it('shows a repeating rate without its full binary expansion', () => {
    expect(formatFactor(1 / 22)).toBe('0.045454545');
    expect(formatFactor(0.9144)).toBe('0.9144');
  });
});

describe('the money a conversion must not move', () => {
  it('keeps a line worth what it was worth', () => {
    // 120 gaz at Rs 100 is Rs 12,000, and it stays Rs 12,000 after the row is stored in
    // metres — which is why the rate is re-derived from the amount rather than scaled.
    const qty = 120;
    const rate = 100;
    const factor = resolveFactor('gaz', 'meter')!.value;
    const shelfQty = convertQty(qty, factor);
    const shelfRate = (qty * rate) / shelfQty;

    expect(shelfQty).toBe(109.73);
    expect(shelfQty * shelfRate).toBeCloseTo(qty * rate, 6);
    // Scaling the rate instead would have missed, which is the bug this guards.
    expect(shelfQty * (rate / factor)).not.toBeCloseTo(qty * rate, 6);
  });
});
