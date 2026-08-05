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
import { navFor } from './nav';

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

  /** Recomputes when the user switches shops — the same login can be owner in one, viewer in another. */
  protected readonly nav = computed(() => navFor(this.stores.role()));
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
