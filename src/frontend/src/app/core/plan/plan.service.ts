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
  limits: { maxStores: number; maxUsers: number; whatsappQuota: number };
  usage: { stores: number; users: number };
}

/**
 * How close to the end a plan has to be before the user is told. A week: long enough that a
 * shopkeeper who only opens the app on market days still sees it before being locked out,
 * short enough not to be background noise for the other three weeks.
 */
const WARN_WITHIN_DAYS = 7;

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

  /** Fetches the plan, caching it for the session. Call {@link refresh} after changing usage. */
  async load(): Promise<PlanStatus> {
    const cached = this._status();
    return cached ?? this.refresh();
  }

  async refresh(): Promise<PlanStatus> {
    const status = await firstValueFrom(
      this.http.get<PlanStatus>(`${environment.apiUrl}/plan/me`),
    );
    this._status.set(status);
    return status;
  }
}
