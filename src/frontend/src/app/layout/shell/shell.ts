import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';
import { BrandMark } from '../../shared/brand-mark/brand-mark';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';
import { ThemeToggle } from '../../shared/theme-toggle/theme-toggle';
import { InstallButton } from '../../shared/install-button/install-button';
import { PrintDetailsDialog } from '../../shared/print-details-dialog';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { PlanService, daysUntil } from '../../core/plan/plan.service';
import { navFor } from './nav';

/**
 * One "used of allowed" line on the plan strip: the numbers as words, and the same numbers
 * as a length. `full` is what the strip goes amber on — being *at* a ceiling is the only
 * part of the count worth interrupting someone for.
 */
function gauge(key: TranslationKey, used: number, max: number) {
  return {
    key,
    params: { used: String(used), max: String(max) },
    full: used >= max,
    fill: max > 0 ? Math.min(100, (used / max) * 100) : 100,
  };
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, BrandMark, LanguageToggle, ThemeToggle, InstallButton, PrintDetailsDialog],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  host: { '(document:keydown.escape)': 'closeOverlay()' },
})
export class Shell {
  protected readonly locale = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly stores = inject(StoreService);
  private readonly plans = inject(PlanService);

  /** Recomputes when the user switches shops — the same login can be owner in one, viewer in another. */
  protected readonly nav = computed(() => navFor(this.stores.role()));

  /**
   * The plan strip in the foot: which plan the account is on and how much of it is spent.
   *
   * Null while nothing is being enforced or the plan hasn't been read — an unknown plan says
   * nothing rather than guessing at one. It is `planLimitGuard` that reads it on the way in,
   * so this costs no request of its own; on a shop shared by another owner the guard skips
   * that fetch and the strip stays away, which is right — that shop runs on their plan.
   */
  protected readonly planBadge = computed(() => {
    const status = this.plans.status();
    if (status === null || !status.enforced) return null;
    return {
      tier: `plan.tier.${status.tier}` as TranslationKey,
      countdown: this.countdown(),
      // Shops first: it is the ceiling a shopkeeper meets more often, and the one that
      // sends them to the plan-limits screen.
      gauges: [
        gauge('plan.badge.shops', status.usage.stores, status.limits.maxStores),
        gauge('plan.badge.seats', status.usage.users, status.limits.maxUsers),
      ],
    };
  });

  /**
   * What the strip says about time left, or null while the end is far enough off not to nag.
   * The thresholds are the plan service's, so this and the picker's banner never disagree.
   */
  private countdown(): { key: TranslationKey; params?: Record<string, string> } | null {
    if (this.plans.expired()) return { key: 'plan.badge.ended' };
    const iso = this.plans.expiresOn();
    if (iso === null || !this.plans.endingSoon()) return null;
    const days = daysUntil(iso);
    if (days <= 0) return { key: 'plan.badge.lastDay' };
    if (days === 1) return { key: 'plan.badge.oneDayLeft' };
    return { key: 'plan.badge.daysLeft', params: { days: String(days) } };
  }

  // open by default on wide screens, collapsed below the 760px breakpoint
  protected readonly open = signal(this.matches('(min-width: 760px)'));
  // groups start collapsed on load; user expands what they need
  private readonly openGroups = signal(new Set<string>());

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  // only collapse on navigation/escape when the panel is an overlay (mobile);
  // on wide screens it stays put so it doesn't close on every click
  closeOverlay(): void {
    if (this.matches('(max-width: 759px)')) this.open.set(false);
  }

  private matches(query: string): boolean {
    return typeof window !== 'undefined' && window.matchMedia(query).matches;
  }

  toggleGroup(key: TranslationKey): void {
    this.openGroups.update((set) => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  isGroupOpen(key: TranslationKey): boolean {
    return this.openGroups().has(key);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
