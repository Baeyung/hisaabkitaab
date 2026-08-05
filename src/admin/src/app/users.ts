import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApi, AdminUser, PlanTier, PlanTierInfo } from './admin-api';

/** The assign-plan form, as the row currently being edited holds it. */
interface PlanForm {
  tier: PlanTier;
  expiresAt: string;
  maxStores: number | null;
  maxUsers: number | null;
  whatsappQuota: number | null;
}

/**
 * Every account, and the plan each is on. Until there is a payment provider this screen is how
 * a customer gets what they paid for, so the whole of it is a list and one form.
 *
 * <p>The form always states a complete plan — an override left blank is cleared, not kept, which
 * matches what the backend does with the request. Blank therefore reads as "use the tier's own
 * number", and the placeholder in each box shows what that number is.
 */
@Component({
  selector: 'app-users',
  imports: [FormsModule],
  templateUrl: './users.html',
})
export class Users {
  private readonly api = inject(AdminApi);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly tiers = signal<PlanTierInfo[]>([]);
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  /** Id of the account whose plan is being edited, or null when the form is closed. */
  protected readonly editing = signal<string | null>(null);
  protected readonly form = signal<PlanForm | null>(null);
  protected readonly saving = signal(false);

  constructor() {
    void this.load();
  }

  /**
   * Both halves of the screen in one go. The tier catalogue is refetched alongside the users
   * rather than once at startup — it is five rows, and paying for it on every search buys a
   * single loading flag and a single error path instead of two of each.
   */
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [users, tiers] = await Promise.all([
        this.api.users(this.query().trim()),
        this.api.planTiers(),
      ]);
      this.users.set(users);
      this.tiers.set(tiers);
    } catch (failure) {
      this.fail(failure);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Credentials the server no longer accepts — the password changed, or the address was taken
   * out of `app.admin.emails`. Dropping them puts the login screen back up, rather than leaving
   * a stale list on screen behind a message asking the user to sign in again.
   */
  private fail(failure: unknown): void {
    if (failure instanceof HttpErrorResponse && (failure.status === 401 || failure.status === 403)) {
      this.api.signOut();
      return;
    }
    this.error.set(describe(failure));
  }

  protected signOut(): void {
    this.api.signOut();
  }

  protected edit(user: AdminUser): void {
    this.error.set('');
    this.editing.set(user.id);
    this.form.set({
      tier: user.plan?.tier ?? 'BASIC',
      // An expiry has to be in the future, so an already-lapsed plan cannot simply be re-offered.
      expiresAt: futureDate(user.plan?.expiresAt),
      maxStores: user.plan?.overrides.maxStores ?? null,
      maxUsers: user.plan?.overrides.maxUsers ?? null,
      whatsappQuota: user.plan?.overrides.whatsappQuota ?? null,
    });
  }

  protected cancel(): void {
    this.editing.set(null);
    this.form.set(null);
  }

  protected update<K extends keyof PlanForm>(field: K, value: PlanForm[K]): void {
    const current = this.form();
    if (current) {
      this.form.set({ ...current, [field]: value });
    }
  }

  protected async save(): Promise<void> {
    const userId = this.editing();
    const form = this.form();
    if (!userId || !form) {
      return;
    }

    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.assignPlan(userId, {
        tier: form.tier,
        expiresAt: form.expiresAt,
        maxStores: blankToNull(form.maxStores),
        maxUsers: blankToNull(form.maxUsers),
        whatsappQuota: blankToNull(form.whatsappQuota),
      });
      this.cancel();
      await this.load();
    } catch (failure) {
      this.fail(failure);
    } finally {
      this.saving.set(false);
    }
  }

  /** The tier's own numbers, shown as placeholders so a blank box says what it will mean. */
  protected defaultsFor(tier: PlanTier): PlanTierInfo | undefined {
    return this.tiers().find((info) => info.tier === tier);
  }
}

/** An empty number input arrives as an empty string; the backend wants a null. */
function blankToNull(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : value;
}

/** The given date if it is still ahead of us, otherwise a year from today. */
function futureDate(existing: string | null | undefined): string {
  const fallback = new Date();
  fallback.setFullYear(fallback.getFullYear() + 1);
  const fallbackIso = fallback.toISOString().slice(0, 10);

  if (!existing) {
    return fallbackIso;
  }
  return existing > new Date().toISOString().slice(0, 10) ? existing : fallbackIso;
}

function describe(failure: unknown): string {
  if (failure instanceof HttpErrorResponse) {
    if (failure.status === 400) {
      return 'That plan was rejected — check the expiry date and the limits.';
    }
    if (failure.status === 0) {
      return 'Could not reach the server.';
    }
  }
  return 'Something went wrong. Try again.';
}
