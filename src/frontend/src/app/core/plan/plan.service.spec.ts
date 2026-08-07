import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlanService, PlanStatus, daysUntil } from './plan.service';
import { AuthStore } from '../auth/auth.store';
import { environment } from '../../../environments/environment';

/** An ISO `yyyy-MM-dd` `days` from today, built the way the backend's LocalDate would be. */
function isoIn(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A paid plan with WhatsApp on it; each case below bends one field of this. */
const paid: PlanStatus = {
  tier: 'BASIC',
  expiresAt: isoIn(30),
  expired: false,
  enforced: true,
  limits: { maxStores: 1, maxUsers: 1, whatsappQuota: 50 },
  usage: { stores: 1, users: 1 },
};

/** Who the WhatsApp button is offered to. The backend does not refuse these yet, so this is it. */
describe('PlanService.whatsappAllowed', () => {
  async function loaded(status: PlanStatus | null): Promise<PlanService> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { credentials: signal('creds') } },
      ],
    });
    const plan = TestBed.inject(PlanService);
    if (status !== null) {
      const read = plan.refresh();
      TestBed.inject(HttpTestingController)
        .expectOne(`${environment.apiUrl}/plan/me`)
        .flush(status);
      await read;
    }
    return plan;
  }

  it('offers sending on a running plan with quota', async () => {
    expect((await loaded(paid)).whatsappAllowed()).toBe(true);
  });

  it('withholds it on a trial, which carries no quota', async () => {
    const plan = await loaded({
      ...paid,
      tier: 'TRIAL',
      limits: { ...paid.limits, whatsappQuota: 0 },
    });
    expect(plan.whatsappAllowed()).toBe(false);
  });

  it('withholds it once the plan has run out', async () => {
    expect((await loaded({ ...paid, expired: true })).whatsappAllowed()).toBe(false);
  });

  it('offers it when the plan is unknown or unenforced, never locking a user out on a bad read', async () => {
    expect((await loaded(null)).whatsappAllowed()).toBe(true);
    const unenforced = {
      ...paid,
      enforced: false,
      expired: true,
      limits: { ...paid.limits, whatsappQuota: 0 },
    };
    expect((await loaded(unenforced)).whatsappAllowed()).toBe(true);
  });
});

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
