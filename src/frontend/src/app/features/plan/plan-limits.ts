import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { AuthService } from '../../core/auth/auth.service';
import { StoreService } from '../../core/store/store.service';
import { MemberService } from '../../core/store/member.service';
import { OveragePerson, OverageStore, PlanService } from '../../core/plan/plan.service';
import { OuterBar } from '../../shared/outer-bar/outer-bar';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * "Your plan no longer covers all of this" — where an account using more than it is entitled
 * to says what it is keeping.
 *
 * Reached by `planLimitGuard` redirecting off every route that is the user's own work, and
 * it is the only way back out. Two things can be given up, in the order they are asked for:
 *
 * 1. **Shops.** Kept or closed, never deleted by this screen's main action. A closed shop
 *    stays readable and printable and comes back the moment the plan has room for it — a
 *    billing change must not be able to destroy somebody's books. Deleting one is still
 *    offered, behind the same type-the-name confirmation Store Settings uses, because an
 *    owner who genuinely wants it gone should not have to go looking.
 * 2. **People.** Only asked once the shops fit, because closing a shop takes its people out
 *    of the count too — being told to remove someone you were about to lose anyway is the
 *    kind of wasted step that makes a lockout screen feel like a punishment.
 *
 * The seat count is the server's throughout: the same person in three shops is one seat, and
 * a closed shop's people are nobody's. This screen displays what `/api/plan/overage` counted
 * and never re-derives it.
 */
@Component({
  selector: 'app-plan-limits',
  imports: [OuterBar],
  templateUrl: './plan-limits.html',
  styleUrl: './plan-limits.css',
})
export class PlanLimits {
  protected readonly locale = inject(LocaleService);
  protected readonly plan = inject(PlanService);
  private readonly auth = inject(AuthService);
  private readonly stores = inject(StoreService);
  private readonly members = inject(MemberService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly allStores = signal<OverageStore[]>([]);
  protected readonly people = signal<OveragePerson[]>([]);

  /** The shops the user currently intends to keep open. Seeded from what is open today. */
  protected readonly keep = signal<ReadonlySet<string>>(new Set());

  /** Which row is being asked about before it goes, mirroring the users screen's pattern. */
  protected readonly confirmingPersonId = signal<string | null>(null);
  /** The shop whose delete dialog is open, and the name typed to arm it. */
  protected readonly deletingStore = signal<OverageStore | null>(null);
  protected readonly typedName = signal('');

  protected readonly maxStores = computed(() => this.plan.status()?.limits.maxStores ?? 0);
  protected readonly maxUsers = computed(() => this.plan.status()?.limits.maxUsers ?? 0);

  /** Seats in use as the server counts them — not derivable from {@link people} alone. */
  protected readonly usedUsers = computed(() => this.plan.status()?.usage.users ?? 0);

  /** How many shops the user has ticked, against how many the plan allows. */
  protected readonly keptCount = computed(() => this.keep().size);
  protected readonly storesFit = computed(() => this.keptCount() <= this.maxStores());

  /** Whether the choice on screen differs from what is already saved. */
  protected readonly dirty = computed(() =>
    this.allStores().some((store) => store.suspended === this.keep().has(store.id)),
  );

  /**
   * Whether the seat ceiling is still over *after* the shops on screen are applied. Counted
   * here rather than read off the plan because the user has not saved yet, and asking them
   * to remove people who are about to be freed by a shop closing would be wrong. The owner
   * holds a seat and appears in no grant, so they are added back the way the server does.
   */
  protected readonly projectedUsers = computed(() => {
    const kept = this.keep();
    return this.people().filter((p) => p.storeIds.some((id) => kept.has(id))).length + 1;
  });

  protected readonly usersFit = computed(() => this.projectedUsers() <= this.maxUsers());

  /** Who is still costing a seat under the current choice — the only people worth showing. */
  protected readonly peopleInKeptStores = computed(() => {
    const kept = this.keep();
    return this.people().filter((p) => p.storeIds.some((id) => kept.has(id)));
  });

  /** Everything fits, so the choice can be committed. */
  protected readonly resolved = computed(() => this.storesFit() && this.usersFit());

  // The counted lines, built here rather than in the template: `locale.t` interpolates
  // strings, and the alternative is a cast at three call sites in the markup.
  protected readonly shopsCount = computed(() =>
    this.locale.t('planLimits.shops.count', {
      kept: `${this.keptCount()}`,
      max: `${this.maxStores()}`,
    }),
  );

  protected readonly peopleCount = computed(() =>
    this.locale.t('planLimits.people.count', {
      used: `${this.projectedUsers()}`,
      max: `${this.maxUsers()}`,
    }),
  );

  /** What the commit bar says: the nearest thing still standing between them and done. */
  protected readonly barStatus = computed(() => {
    if (this.resolved()) {
      return this.locale.t('planLimits.bar.ready');
    }
    return this.storesFit()
      ? this.locale.t('planLimits.bar.people')
      : this.locale.t('planLimits.bar.shops', { over: `${this.keptCount() - this.maxStores()}` });
  });

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const overage = await this.plan.overage();
      this.allStores.set(overage.stores);
      this.people.set(overage.people);
      this.keep.set(new Set(overage.stores.filter((s) => !s.suspended).map((s) => s.id)));
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Tick or untick a shop. Untick is always allowed; ticking past the ceiling is not, so the
   * counter can never read a number the save would be refused for — the user is stopped at
   * the moment of the impossible click rather than at the bottom of the screen.
   */
  toggle(store: OverageStore): void {
    this.errorKey.set(null);
    this.keep.update((kept) => {
      const next = new Set(kept);
      if (next.has(store.id)) {
        next.delete(store.id);
      } else if (next.size < this.maxStores()) {
        next.add(store.id);
      }
      return next;
    });
  }

  protected isKept(store: OverageStore): boolean {
    return this.keep().has(store.id);
  }

  /** Whether ticking this shop would be refused, so the card can say so instead of ignoring. */
  protected isBlocked(store: OverageStore): boolean {
    return !this.isKept(store) && this.keptCount() >= this.maxStores();
  }

  /** The mark on a card: the shop's logo, else its initial. Same rule as the store picker. */
  markOf(store: OverageStore): string {
    return (store.name ?? '').trim().charAt(0).toUpperCase();
  }

  /** What a person's row says about where they work, under the current choice. */
  protected shopsOf(person: OveragePerson): string {
    const kept = this.keep();
    const names = this.allStores()
      .filter((s) => kept.has(s.id) && person.storeIds.includes(s.id))
      .map((s) => s.name);
    return names.join(', ');
  }

  protected displayName(person: OveragePerson): string {
    return person.name ?? this.locale.t('members.pending');
  }

  /** Commit the choice. The plan comes back with it, so the guard re-reads the truth. */
  async save(): Promise<void> {
    if (!this.resolved() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      await this.plan.resolveOverage([...this.keep()]);
      // The list carries `suspended` on every card and the shell reads it, so it has to be
      // re-fetched rather than patched — a stale entry would leave a re-opened shop read-only.
      await this.stores.list().catch(() => null);
      this.toast.success(this.locale.t('planLimits.saved'));
      await this.router.navigate(['/stores']);
    } catch {
      this.errorKey.set('error.generic');
      this.saving.set(false);
    }
  }

  askRemovePerson(userId: string): void {
    this.errorKey.set(null);
    this.confirmingPersonId.set(userId);
  }

  cancelRemovePerson(): void {
    this.confirmingPersonId.set(null);
  }

  /**
   * Take someone's access away everywhere in this account. Removal is per-shop on the
   * backend, so this is one call per shop they are in — a seat is only freed once the last
   * of them is gone, and leaving them in one shop would free nothing.
   */
  async confirmRemovePerson(person: OveragePerson): Promise<void> {
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      for (const storeId of person.storeIds) {
        await this.members.removeFrom(storeId, person.userId);
      }
      this.people.update((list) => list.filter((p) => p.userId !== person.userId));
      this.confirmingPersonId.set(null);
      this.toast.success(this.locale.t('toast.deleted', { label: this.displayName(person) }));
    } catch {
      this.errorKey.set('error.generic');
      // Partially removed: what is left is whatever the reload says, never what we assumed.
      await this.load();
    } finally {
      this.saving.set(false);
    }
  }

  openDelete(store: OverageStore): void {
    this.errorKey.set(null);
    this.typedName.set('');
    this.deletingStore.set(store);
  }

  cancelDelete(): void {
    this.deletingStore.set(null);
  }

  /** Armed only on an exact match, as Store Settings has it: no trimming, no case folding. */
  protected readonly canDelete = computed(() => {
    const store = this.deletingStore();
    return store !== null && this.typedName() === store.name;
  });

  async confirmDelete(): Promise<void> {
    const store = this.deletingStore();
    // Re-checked here and not only on the button: the dialog can be submitted by Enter.
    if (!store || !this.canDelete() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    try {
      await this.stores.delete(store.id);
      this.deletingStore.set(null);
      this.toast.success(this.locale.t('toast.deleted', { label: store.name }));
      // The shop is gone from every count, so the whole screen is re-read rather than the
      // one card dropped — its people may have gone with it.
      await this.load();
    } catch {
      this.errorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
