import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApi, AdminUser, Plan, PlanTier, PlanTierInfo } from './admin-api';

/** The assign-plan form, as the row currently being edited holds it. */
interface PlanForm {
  tier: PlanTier;
  expiresAt: string;
  maxStores: number | null;
  maxUsers: number | null;
  whatsappQuota: number | null;
  /**
   * Tri-state like the numbers beside it, and for the same reason: null is "leave it to the
   * tier", which is not the same answer as an explicit false.
   */
  dailyReports: boolean | null;
  reminderContacts: number | null;
}

/**
 * Where a plan stands, as one of four states rather than a set of flags. They are exclusive and
 * every account is in exactly one, so the tallies beside them add up to the register.
 */
type Standing = 'ACTIVE' | 'SOON' | 'EXPIRED' | 'NONE';

/** Where the account itself stands — signed up and verified, or not yet either. */
type Account = 'VERIFIED' | 'UNVERIFIED' | 'INVITED';

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

  /**
   * The three narrowing controls. The search box asks the server; these do not — the register
   * arrives whole, so narrowing it is a filter over what is already on screen and answers on the
   * keystroke rather than the round trip.
   */
  protected readonly tier = signal<PlanTier | 'ALL'>('ALL');
  protected readonly standing = signal<Standing | 'ALL'>('ALL');
  protected readonly account = signal<Account | 'ALL'>('ALL');

  protected readonly standings: readonly { value: Standing | 'ALL'; label: string }[] = [
    { value: 'ALL', label: 'Any' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'SOON', label: 'Expiring in a month' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'NONE', label: 'No plan' },
  ];

  protected readonly accounts: readonly { value: Account | 'ALL'; label: string }[] = [
    { value: 'ALL', label: 'Any' },
    { value: 'VERIFIED', label: 'Verified' },
    { value: 'UNVERIFIED', label: 'Unverified' },
    { value: 'INVITED', label: 'Invited' },
  ];

  /** The rows the filters leave standing. */
  protected readonly visible = computed(() =>
    this.users().filter(
      (user) =>
        (this.tier() === 'ALL' || user.plan?.tier === this.tier()) &&
        (this.standing() === 'ALL' || standingOf(user) === this.standing()) &&
        (this.account() === 'ALL' || accountOf(user) === this.account()),
    ),
  );

  protected readonly filtering = computed(
    () => this.tier() !== 'ALL' || this.standing() !== 'ALL' || this.account() !== 'ALL',
  );

  protected clearFilters(): void {
    this.tier.set('ALL');
    this.standing.set('ALL');
    this.account.set('ALL');
  }

  /**
   * How many accounts sit in every bucket of every facet, keyed `facet:value`. The dropdowns carry
   * these next to their labels, so the closed register can be read off the controls — "how many
   * lapsed" is answered before anyone opens the menu, let alone picks from it.
   *
   * <p>Counted over the whole search result, not the filtered view, so the numbers say what each
   * option would show rather than collapsing to zero as soon as a sibling filter is on.
   */
  private readonly tally = computed(() => {
    const counts: Record<string, number> = {};
    for (const user of this.users()) {
      for (const key of [
        `tier:${user.plan?.tier}`,
        `standing:${standingOf(user)}`,
        `account:${accountOf(user)}`,
      ]) {
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  });

  protected tallyOf(facet: string, value: string): number {
    return value === 'ALL' ? this.users().length : (this.tally()[`${facet}:${value}`] ?? 0);
  }

  /** What is on screen, as a line: the total, and the two states worth acting on. */
  protected readonly counts = computed(() => {
    const users = this.visible();
    return {
      total: users.length,
      expired: users.filter((user) => user.plan?.expired).length,
      unplanned: users.filter((user) => !user.plan).length,
    };
  });

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

  /** The terms sold, in months. A renewal is one of these, not a trip through the calendar. */
  protected readonly terms: readonly { months: number; label: string }[] = [
    { months: 1, label: '1 month' },
    { months: 3, label: '3 months' },
    { months: 6, label: '6 months' },
    { months: 12, label: '1 year' },
  ];

  /**
   * The date a term counts from: what is left on an unexpired plan, otherwise today. A customer
   * renewing early keeps the days they already paid for.
   */
  protected readonly termBase = signal(today());

  /** What the buttons count from, said plainly, so the label never claims the wrong start. */
  protected readonly termsFrom = computed(() =>
    this.termBase() === today() ? 'from today' : `from ${this.termBase()}`,
  );

  /** The earliest date the backend will take — it requires an expiry strictly after today. */
  protected readonly earliest = addMonths(today(), 0, 1);

  protected edit(user: AdminUser): void {
    this.error.set('');
    this.editing.set(user.id);

    const existing = user.plan?.expiresAt;
    const remaining = existing && existing > today() ? existing : null;
    this.termBase.set(remaining ?? today());

    this.form.set({
      tier: user.plan?.tier ?? 'BASIC',
      // Blank for a lapsed or unplanned account, so the admin has to state the term. This box
      // used to open a year ahead, which meant a mis-click gave away twelve months.
      expiresAt: remaining ?? '',
      maxStores: user.plan?.overrides.maxStores ?? null,
      maxUsers: user.plan?.overrides.maxUsers ?? null,
      whatsappQuota: user.plan?.overrides.whatsappQuota ?? null,
      dailyReports: user.plan?.overrides.dailyReports ?? null,
      reminderContacts: user.plan?.overrides.reminderContacts ?? null,
    });
  }

  protected setTerm(months: number): void {
    this.update('expiresAt', addMonths(this.termBase(), months));
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
        dailyReports: form.dailyReports,
        reminderContacts: blankToNull(form.reminderContacts),
      });
      this.cancel();
      await this.load();
    } catch (failure) {
      this.fail(failure);
    } finally {
      this.saving.set(false);
    }
  }

  /** What the plan actually grants, as one line — overrides already folded in by the server. */
  protected limits(plan: Plan): string {
    return [
      count(plan.limits.maxStores, 'store'),
      count(plan.limits.maxUsers, 'user'),
      count(plan.limits.whatsappQuota, 'msg'),
      // Only worth a word when the plan actually carries them — every Basic row saying
      // "no reports · 0 reminders" would be noise down the whole register.
      plan.limits.dailyReports ? 'daily report' : null,
      plan.limits.reminderContacts ? count(plan.limits.reminderContacts, 'reminder') : null,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');
  }

  /** The tier's own numbers, shown as placeholders so a blank box says what it will mean. */
  protected defaultsFor(tier: PlanTier): PlanTierInfo | undefined {
    return this.tiers().find((info) => info.tier === tier);
  }
}

/**
 * Which of the four a plan is in. "Soon" is carved out of active because a month is the shortest
 * term sold — anything inside one is a renewal conversation, not a healthy account. A plan whose
 * clock has not started has no date to fall due, so it reads as active.
 */
export function standingOf(user: AdminUser): Standing {
  const plan = user.plan;
  if (!plan) {
    return 'NONE';
  }
  if (plan.expired) {
    return 'EXPIRED';
  }
  return plan.expiresAt && plan.expiresAt <= addMonths(today(), 1) ? 'SOON' : 'ACTIVE';
}

/** An INVITED placeholder has nobody behind it yet, so it is neither verified nor unverified. */
function accountOf(user: AdminUser): Account {
  if (user.status === 'INVITED') {
    return 'INVITED';
  }
  return user.verified ? 'VERIFIED' : 'UNVERIFIED';
}

function count(value: number | null, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/** An empty number input arrives as an empty string; the backend wants a null. */
function blankToNull(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : value;
}

/**
 * Today where the admin is sitting. `toISOString` would answer in UTC, which is a day behind
 * Pakistan for the first five hours of every morning — long enough to misjudge an expiry.
 */
function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * `date` moved on by whole months, then days. The day of the month is held where it exists and
 * clamped where it does not, so 31 January plus a month is 28 February rather than 3 March —
 * a term should never quietly run longer than the one that was sold.
 */
export function addMonths(date: string, months: number, days = 0): string {
  const moved = new Date(`${date}T00:00:00`);
  const day = moved.getDate();
  moved.setDate(1);
  moved.setMonth(moved.getMonth() + months);
  moved.setDate(Math.min(day, new Date(moved.getFullYear(), moved.getMonth() + 1, 0).getDate()));
  moved.setDate(moved.getDate() + days);
  return moved.toLocaleDateString('en-CA');
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
