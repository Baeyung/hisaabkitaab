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
  usage: { stores: 1, users: 1, whatsapp: 0 },
};

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
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/plan/me`).flush(status);
    await read;
  }
  return plan;
}

/**
 * Whether the plan covers WhatsApp at all. The backend refuses these too — see
 * `PlanService.spendWhatsappMessage` — so this is only about not offering a button that would
 * fail.
 */
describe('PlanService.whatsappAllowed', () => {
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

/**
 * The month's remaining messages, which is a different question from whether the plan covers
 * WhatsApp at all — a shopkeeper who is out until the 1st must not be told to upgrade.
 */
describe('PlanService.whatsappRemaining', () => {
  it('counts down as the month is spent', async () => {
    const plan = await loaded({ ...paid, usage: { ...paid.usage, whatsapp: 12 } });
    expect(plan.whatsappRemaining()).toBe(38);
    expect(plan.whatsappExhausted()).toBe(false);
  });

  it('is exhausted at the ceiling, while the plan still covers sending', async () => {
    const plan = await loaded({ ...paid, usage: { ...paid.usage, whatsapp: 50 } });
    expect(plan.whatsappRemaining()).toBe(0);
    expect(plan.whatsappExhausted()).toBe(true);
    // Out of messages is not off the plan — the button says different things for each.
    expect(plan.whatsappAllowed()).toBe(true);
  });

  it('never goes negative when an admin cuts the quota below what is already spent', async () => {
    const plan = await loaded({
      ...paid,
      limits: { ...paid.limits, whatsappQuota: 10 },
      usage: { ...paid.usage, whatsapp: 30 },
    });
    expect(plan.whatsappRemaining()).toBe(0);
  });

  it('has no number to show on an unknown, unenforced, or WhatsApp-less plan', async () => {
    expect((await loaded(null)).whatsappRemaining()).toBeNull();
    expect((await loaded({ ...paid, enforced: false })).whatsappRemaining()).toBeNull();
    const noQuota = { ...paid, limits: { ...paid.limits, whatsappQuota: 0 } };
    expect((await loaded(noQuota)).whatsappRemaining()).toBeNull();
    // …and that must never read as "exhausted", which would blame the wrong thing.
    expect((await loaded(noQuota)).whatsappExhausted()).toBe(false);
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
