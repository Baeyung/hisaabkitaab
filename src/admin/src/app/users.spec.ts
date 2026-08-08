import { AdminUser, Plan } from './admin-api';
import { addMonths, standingOf } from './users';

function account(plan: Partial<Plan> | null): AdminUser {
  return {
    id: '1',
    name: 'Test',
    email: null,
    contactNumber: '0300',
    verified: true,
    status: 'ACTIVE',
    plan: plan && ({ tier: 'BASIC', expired: false, ...plan } as Plan),
  };
}

/**
 * The standing filter is what the back office renews from, so the boundary that decides whether
 * an account shows up as expiring is worth pinning down.
 */
describe('standingOf', () => {
  const today = new Date().toLocaleDateString('en-CA');

  it('sorts a plan by what its date says', () => {
    expect(standingOf(account(null))).toBe('NONE');
    expect(standingOf(account({ expired: true, expiresAt: '2020-01-01' }))).toBe('EXPIRED');
    expect(standingOf(account({ expiresAt: addMonths(today, 6) }))).toBe('ACTIVE');
  });

  it('calls anything inside a month expiring, since a month is the shortest term sold', () => {
    expect(standingOf(account({ expiresAt: addMonths(today, 1) }))).toBe('SOON');
    expect(standingOf(account({ expiresAt: addMonths(today, 1, 1) }))).toBe('ACTIVE');
    expect(standingOf(account({ expiresAt: addMonths(today, 0, 1) }))).toBe('SOON');
  });

  it('reads a plan whose clock never started as active — it has no date to fall due', () => {
    expect(standingOf(account({ expiresAt: null }))).toBe('ACTIVE');
  });
});

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
