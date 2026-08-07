import { addMonths } from './users';

/**
 * A term button decides what a customer is entitled to, so the only thing tested here is that
 * the arithmetic never hands out a day nobody paid for.
 */
describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths('2026-08-07', 1)).toBe('2026-09-07');
    expect(addMonths('2026-08-07', 3)).toBe('2026-11-07');
    expect(addMonths('2026-08-07', 12)).toBe('2027-08-07');
  });

  it('clamps to the end of a shorter month rather than spilling into the next one', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('crosses a year boundary', () => {
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('adds days, which is how the earliest allowed expiry is reached', () => {
    expect(addMonths('2026-08-07', 0, 1)).toBe('2026-08-08');
    expect(addMonths('2026-12-31', 0, 1)).toBe('2027-01-01');
  });
});
