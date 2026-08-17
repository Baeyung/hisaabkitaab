import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';

export type PlanTier = 'TRIAL' | 'BASIC' | 'PREMIUM' | 'PREMIUM_PLUS' | 'ENTERPRISE';

export interface PlanStatus {
  tier: PlanTier;
  /** Null while the trial's clock has not started. */
  expiresAt: string | null;
  expired: boolean;
  /** False when the server is not applying plans at all — see {@link PlanService.atStoreLimit}. */
  enforced: boolean;
  /**
   * `dailyReports` and `reminderContacts` are what the scheduled reports are sold on:
   * whether the nightly report may go out at all, and how many khata holders one shop may
   * chase in a month. A ceiling on the monthly job's selection rather than a quota it spends,
   * so zero means the reminders are simply not part of this plan.
   */
  limits: {
    maxStores: number;
    maxUsers: number;
    whatsappQuota: number;
    dailyReports: boolean;
    reminderContacts: number;
  };
  /** `whatsapp` is messages sent *this calendar month* — the other two are standing totals. */
  usage: { stores: number; users: number; whatsapp: number };
}

/** One of the owner's shops, as something to keep open or close. Mirrors `OverageStore`. */
export interface OverageStore {
  id: string;
  name: string;
  logoUri: string;
  suspended: boolean;
}

/**
 * One person with access to any of the owner's shops, listed once however many they are in —
 * a seat costs per person, not per grant. Mirrors `OveragePerson`.
 */
export interface OveragePerson {
  userId: string;
  /** Null while their invite is outstanding. */
  name: string | null;
  email: string;
  storeIds: string[];
}

/** Everything the "choose what to keep" screen needs, in one response. */
export interface Overage {
  plan: PlanStatus;
  stores: OverageStore[];
  people: OveragePerson[];
}

/**
 * How close to the end a plan has to be before the user is told. A week: long enough that a
 * shopkeeper who only opens the app on market days still sees it before being locked out,
 * short enough not to be background noise for the other three weeks.
 */
export const WARN_WITHIN_DAYS = 7;

/**
 * Whole days from today to an ISO `yyyy-MM-dd`. Both ends are pinned to local midnight, so
 * this counts calendar days the way the backend's `LocalDate` comparison does rather than
 * 24-hour blocks — the answer must not depend on what time of day the user opened the app.
 */
export function daysUntil(iso: string): number {
  const end = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/**
 * The signed-in user's plan and what they have spent against it.
 *
 * Read by the screens that would rather grey a control out than let someone find a ceiling by
 * hitting it. The server refuses the same calls regardless — this is about not offering what
 * would fail, exactly as {@link StoreService}'s role signals are.
 *
 * Limits are the *owner's*: they cover the shops this user owns and the people they have shared
 * those shops with. A shop shared *with* them belongs to its own owner's plan and is none of
 * this.
 */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthStore);

  private readonly _status = signal<PlanStatus | null>(null);
  readonly status = this._status.asReadonly();

  constructor() {
    // Same reasoning as StoreService's cache: this belongs to one session, so drop it when
    // credentials go away or the next user to sign in on this tab inherits someone else's plan.
    effect(() => {
      if (this.auth.credentials() === null) {
        this._status.set(null);
      }
    });
  }

  /**
   * Whether one more shop would be refused. False until the plan has actually been loaded and
   * while the server is not enforcing — an unknown or unenforced plan must never disable a
   * control, or a failed fetch would lock a paying user out of their own product.
   */
  readonly atStoreLimit = computed(() => this.isAtLimit('stores', 'maxStores'));

  /** Whether one more *new* person would be refused. Re-inviting an existing member still fits. */
  readonly atUserLimit = computed(() => this.isAtLimit('users', 'maxUsers'));

  private isAtLimit(used: 'stores' | 'users', ceiling: 'maxStores' | 'maxUsers'): boolean {
    const status = this._status();
    return status !== null && status.enforced && status.usage[used] >= status.limits[ceiling];
  }

  /**
   * Whether the plan has run out. Normally unreachable — an expired account cannot sign in —
   * but a user whose own plan lapsed is still let in on a shop shared by a paid-up owner, and
   * for them this is true while everything of their own is refused.
   */
  readonly expired = computed(() => {
    const status = this._status();
    return status !== null && status.enforced && status.expired;
  });

  /**
   * Whether the plan runs out within the week, so a screen can say so before the lockout
   * rather than after it. False while the trial's clock has not started, and false once it has
   * already run out — that is {@link expired}, which is a different thing to say.
   */
  readonly endingSoon = computed(() => {
    const status = this._status();
    if (status === null || !status.enforced || status.expired || status.expiresAt === null) {
      return false;
    }
    return daysUntil(status.expiresAt) <= WARN_WITHIN_DAYS;
  });

  /** The last day the plan covers, or null when nothing is being enforced or no clock runs. */
  readonly expiresOn = computed(() => {
    const status = this._status();
    return status !== null && status.enforced ? status.expiresAt : null;
  });

  /**
   * Whether the account may send on WhatsApp at all: a quota above zero on a plan that is still
   * running. False is what a trial gets (`PlanTier.TRIAL` allows nothing). True while the plan
   * is unknown or unenforced, for the same reason {@link atStoreLimit} is false there.
   */
  readonly whatsappAllowed = computed(() => {
    const status = this._status();
    return (
      status === null || !status.enforced || (!status.expired && status.limits.whatsappQuota > 0)
    );
  });

  /**
   * Messages left to send this month, or null when there is no number to show — an unknown or
   * unenforced plan, or one that does not cover WhatsApp at all ({@link whatsappAllowed} is
   * what says that, and says it differently).
   *
   * Never negative: an admin can cut a quota below what has already been spent this month, and
   * "-8 left" is not a thing to put in front of a shopkeeper.
   */
  readonly whatsappRemaining = computed(() => {
    const status = this._status();
    if (status === null || !status.enforced || status.limits.whatsappQuota === 0) {
      return null;
    }
    return Math.max(0, status.limits.whatsappQuota - status.usage.whatsapp);
  });

  /**
   * Whether this month's quota is gone, on a plan that otherwise covers sending. Distinct from
   * `!whatsappAllowed()`, which is not paying for WhatsApp in the first place — one is answered
   * by waiting for the month to turn, the other only by upgrading.
   */
  readonly whatsappExhausted = computed(() => this.whatsappRemaining() === 0);

  /**
   * Whether this account's plan covers the nightly report to the owner, and the monthly khata
   * reminders. Both true while the plan is unknown or unenforced, for the same reason
   * {@link whatsappAllowed} is — a screen must not lock itself over a plan it has not read.
   *
   * The Reports settings screen greys itself out on these, but the rule is the scheduler's:
   * it asks the plan again when the job fires, so a shop whose plan lapsed after the setting
   * was saved simply stops sending. Same arrangement as the WhatsApp button.
   */
  readonly dailyReportsAllowed = computed(() => this.covers((l) => l.dailyReports));

  readonly remindersAllowed = computed(() => this.covers((l) => l.reminderContacts > 0));

  /** How many parties one shop may chase a month, or null when there is no number to show. */
  readonly reminderContacts = computed(() => {
    const status = this._status();
    return status === null || !status.enforced ? null : status.limits.reminderContacts;
  });

  private covers(has: (limits: PlanStatus['limits']) => boolean): boolean {
    const status = this._status();
    return status === null || !status.enforced || (!status.expired && has(status.limits));
  }

  /**
   * How many shops are open beyond what the plan covers, and how many seats are spent beyond
   * it. Zero unless an admin has moved the account onto a smaller plan than it was using —
   * nothing a user can do to their own account gets here, because every path that adds is
   * already refused at the ceiling.
   */
  readonly excessStores = computed(() => this.excessOf('stores', 'maxStores'));
  readonly excessUsers = computed(() => this.excessOf('users', 'maxUsers'));

  private excessOf(used: 'stores' | 'users', ceiling: 'maxStores' | 'maxUsers'): number {
    const status = this._status();
    if (status === null || !status.enforced) {
      return 0;
    }
    return Math.max(0, status.usage[used] - status.limits[ceiling]);
  }

  /**
   * Whether the account is using more than it is entitled to, and must say what it is giving
   * up before working again. Distinct from {@link atStoreLimit}, which is merely being *at* a
   * ceiling — that stops the next shop, this stops everything.
   */
  readonly overLimit = computed(() => this.excessStores() > 0 || this.excessUsers() > 0);

  /** Fetches the plan, caching it for the session. Call {@link refresh} after changing usage. */
  async load(): Promise<PlanStatus> {
    const cached = this._status();
    return cached ?? this.refresh();
  }

  /** The shops and people behind the overage, for the screen where the owner picks. */
  overage(): Promise<Overage> {
    return firstValueFrom(this.http.get<Overage>(`${environment.apiUrl}/plan/overage`));
  }

  /**
   * Settles which shops stay open; the owner's others are closed. The whole set is sent, so
   * this also re-opens a shop closed earlier once a bigger plan has left room for it.
   */
  async resolveOverage(keepStoreIds: string[]): Promise<PlanStatus> {
    const status = await firstValueFrom(
      this.http.put<PlanStatus>(`${environment.apiUrl}/plan/overage`, { keepStoreIds }),
    );
    this._status.set(status);
    return status;
  }

  async refresh(): Promise<PlanStatus> {
    const status = await firstValueFrom(this.http.get<PlanStatus>(`${environment.apiUrl}/plan/me`));
    this._status.set(status);
    return status;
  }
}
