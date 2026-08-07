import { daysUntil } from './plan.service';

/** An ISO `yyyy-MM-dd` `days` from today, built the way the backend's LocalDate would be. */
function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('daysUntil', () => {
  it('counts calendar days, whatever the time of day', () => {
    expect(daysUntil(isoIn(0))).toBe(0);
    expect(daysUntil(isoIn(1))).toBe(1);
    expect(daysUntil(isoIn(7))).toBe(7);
    // The plan's last day is still covered, so the warning must not read as a lockout.
    expect(daysUntil(isoIn(-1))).toBe(-1);
  });

  it('lands either side of the week the notice is shown for', () => {
    expect(daysUntil(isoIn(8))).toBeGreaterThan(7);
    expect(daysUntil(isoIn(30))).toBe(30);
  });
});
