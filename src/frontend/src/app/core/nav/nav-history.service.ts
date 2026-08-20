import { Injectable, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';

/** What a NavigationStart told us, held until we know the navigation actually landed. */
interface Pending {
  /** The entry this is returning to, if the browser's own Back/Forward caused it. */
  restored: number | null;
  /** A navigation that rewrites the current entry rather than adding one. */
  replace: boolean;
}

/**
 * Where we are in the run of history entries this app has put on the stack.
 *
 * The browser will not say whether Back or Forward has anywhere to go — there is no API for
 * it, deliberately, since the answer would leak where else the tab has been. So the chevrons
 * in the topbar count for themselves: every navigation that adds an entry moves us one step
 * along, every Back or Forward moves us to an entry we have already numbered, and the two
 * buttons grey out at the ends of that run.
 *
 * The count deliberately stops at the app's own first entry. Whatever was in the tab before
 * — the login screen, another site, a blank tab — is not somewhere a Back chevron inside the
 * shop should offer to go; the browser's own button still goes there, which is the right
 * place for it.
 */
@Injectable({ providedIn: 'root' })
export class NavHistoryService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** Our position in the run. */
  private readonly at = signal(0);
  /** The far end of the run — how far Forward can still go. */
  private readonly last = signal(0);
  /** False until the first navigation lands, which *is* entry zero rather than a step onto it. */
  private opened = false;

  /**
   * navigationId → our index. Angular stamps the id of the navigation that wrote a history
   * entry into that entry's state and hands it back as `restoredState` on the way past, which
   * is what lets a popstate be read as a move to a known place instead of a jump to nowhere.
   */
  private readonly numbered = new Map<number, number>();
  private pending: Pending | null = null;

  readonly canBack = computed(() => this.at() > 0);
  readonly canForward = computed(() => this.at() < this.last());

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.pending = {
          restored: event.restoredState?.navigationId ?? null,
          // Replacements are how the board switches tabs and how guards rewrite a URL:
          // one entry, a different address on it, and no step for us to count.
          replace: this.router.getCurrentNavigation()?.extras.replaceUrl === true,
        };
      } else if (event instanceof NavigationEnd) {
        this.settle(event.id);
      } else if (event instanceof NavigationCancel || event instanceof NavigationError) {
        // A guard that redirects cancels and starts again; only the arrival counts.
        this.pending = null;
      }
    });
  }

  private settle(id: number): void {
    const pending = this.pending;
    this.pending = null;

    // Coming back to somewhere we have been: take that entry's number as our own.
    const restored = pending?.restored != null ? this.numbered.get(pending.restored) : undefined;
    if (restored !== undefined) {
      this.at.set(restored);
      this.numbered.set(id, restored);
      return;
    }

    // Same entry rewritten, or the first arrival, which is entry zero and not a step onto it.
    if (pending?.replace || !this.opened) {
      this.opened = true;
      this.numbered.set(id, this.at());
      return;
    }

    // A new entry. Whatever Forward could have reached is gone, exactly as in the browser.
    const to = this.at() + 1;
    this.at.set(to);
    this.last.set(to);
    this.numbered.set(id, to);
  }

  back(): void {
    if (this.canBack()) this.location.back();
  }

  forward(): void {
    if (this.canForward()) this.location.forward();
  }
}
