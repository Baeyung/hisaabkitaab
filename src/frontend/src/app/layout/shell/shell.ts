import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { NAV, NavLeaf } from './nav';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, LanguageToggle],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  host: { '(document:keydown.escape)': 'closeOverlay()' },
})
export class Shell {
  protected readonly locale = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly stores = inject(StoreService);

  protected readonly nav = NAV;
  // open by default on wide screens, collapsed below the 760px breakpoint
  protected readonly open = signal(this.matches('(min-width: 760px)'));
  // groups start collapsed on load; user expands what they need
  private readonly openGroups = signal(new Set<string>());

  constructor() {
    // Populate shared store state so store-gated nav items resolve; a failure
    // leaves hasStore() false, which keeps them locked — the safe default.
    this.stores.list().catch(() => {});
  }

  /** Store-gated leaves (Items, Parties) stay locked until a store exists. */
  isLocked(child: NavLeaf): boolean {
    return !!child.locked && !this.stores.hasStore();
  }

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
