import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';
import { BrandMark } from '../../shared/brand-mark/brand-mark';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';
import { ThemeToggle } from '../../shared/theme-toggle/theme-toggle';
import { InstallButton } from '../../shared/install-button/install-button';
import { PrintDetailsDialog } from '../../shared/print-details-dialog';
import { ConversionSlip } from '../../shared/conversion-slip/conversion-slip';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { PlanService } from '../../core/plan/plan.service';
import { PlanNotice } from '../../shared/plan-notice/plan-notice';
import { ChromeItem } from '../../core/store/store.models';
import { NavIconMark } from '../../shared/nav-icon/nav-icon';
import { NavLeaf, arranged } from './nav';
import { DevTools } from '../../shared/dev-tools/dev-tools';
import { DevToolsService } from '../../core/dev/dev-tools.service';

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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, BrandMark, LanguageToggle, ThemeToggle, InstallButton, PrintDetailsDialog, ConversionSlip, PlanNotice, NavIconMark, DevTools],
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
  /** The floating gear, and whether this browser has asked for it. */
  protected readonly dev = inject(DevToolsService);

  /**
   * The sidebar: role first, then the shop's own arrangement, then drop what it hides.
   *
   * Recomputes when the user switches shops — the same login can be owner in one and viewer
   * in another, and each shop carries its own arrangement. It also recomputes the instant an
   * owner saves one, since that replaces the cached store this reads from.
   */
  protected readonly nav = computed(() =>
    arranged(this.stores.role(), this.stores.current()?.settings?.menu),
  );

  /**
   * Whether this shop navigates from the board instead of the sidebar.
   *
   * In easy mode the frame gets out of the way entirely: no sidebar, no hamburger, and a
   * Menu button in its place that goes home to the board. Half a sidebar behind a toggle
   * would leave two menus disagreeing about which one you were meant to be using, and the
   * board carries the foot's controls itself.
   *
   * The plan strip is the one thing that does not move across, deliberately. It is standing
   * state, not a control, and the part of it that ever needs acting on — the shop running
   * past what the plan covers — is `<app-plan-notice>` below, which sits outside `<main>`
   * and shows on the board like it does everywhere else.
   */
  protected readonly easy = computed(() => this.stores.current()?.settings?.easyMode === true);

  /**
   * Which of the foot's controls this shop shows. The language switcher is deliberately not
   * among them and never should be: it is the way out of a language you cannot read, and no
   * shop setting may strand a member in one.
   */
  protected readonly chrome = computed(() => {
    const hidden = new Set<ChromeItem>(this.stores.current()?.settings?.hideChrome ?? []);
    return {
      theme: !hidden.has('THEME'),
      install: !hidden.has('INSTALL'),
      plan: !hidden.has('PLAN'),
    };
  });

  /**
   * Whether a menu item is offered but not usable: it records something, and the owner's plan
   * has this shop closed. Shown greyed with "Closed" on it rather than dropped — the sections
   * were there before the downgrade, and a menu that silently sheds them (or worse, bounces
   * every click back to the dashboard, which is what `editorGuard` does to a typed URL) reads
   * as the app being broken rather than as the plan having lapsed.
   */
  protected blocked(item: Pick<NavLeaf, 'writes'>): boolean {
    return item.writes === true && !this.stores.canEdit();
  }

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
      // Shops first: it is the ceiling a shopkeeper meets more often, and the one that
      // sends them to the plan-limits screen.
      gauges: [
        gauge('plan.badge.shops', status.usage.stores, status.limits.maxStores),
        gauge('plan.badge.seats', status.usage.users, status.limits.maxUsers),
      ],
    };
  });

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
