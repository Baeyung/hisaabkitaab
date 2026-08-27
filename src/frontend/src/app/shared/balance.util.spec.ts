import { invertDirection, invertEventKind, invertInOut } from './balance.util';

describe('invertDirection', () => {
  it('flips owing to the other side of the counter', () => {
    expect(invertDirection('THEY_OWE_YOU')).toBe('YOU_OWE_THEM');
    expect(invertDirection('YOU_OWE_THEM')).toBe('THEY_OWE_YOU');
  });

  it('leaves a settled balance alone', () => {
    expect(invertDirection('SETTLED')).toBe('SETTLED');
  });
});

describe('invertInOut', () => {
  it('flips IN/OUT and leaves NONE alone', () => {
    expect(invertInOut('IN')).toBe('OUT');
    expect(invertInOut('OUT')).toBe('IN');
    expect(invertInOut('NONE')).toBe('NONE');
  });
});

describe('invertEventKind', () => {
  it('swaps sale/purchase and receipt/payment', () => {
    expect(invertEventKind('SALE')).toBe('PURCHASE');
    expect(invertEventKind('PURCHASE')).toBe('SALE');
    expect(invertEventKind('RECEIPT')).toBe('PAYMENT');
    expect(invertEventKind('PAYMENT')).toBe('RECEIPT');
  });

  it('leaves every other kind alone', () => {
    expect(invertEventKind('EXPENSE')).toBe('EXPENSE');
    expect(invertEventKind('ADJUSTMENT')).toBe('ADJUSTMENT');
    expect(invertEventKind('PROCESSING')).toBe('PROCESSING');
  });
});
