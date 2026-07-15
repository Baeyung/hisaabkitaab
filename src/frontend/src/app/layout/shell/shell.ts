import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';
import { TranslationKey } from '../../core/i18n/translations/en';
import { NAV } from './nav';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, LanguageToggle],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  host: { '(document:keydown.escape)': 'closeMobile()' },
})
export class Shell {
  protected readonly locale = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly nav = NAV;
  protected readonly mobileOpen = signal(false);
  // groups start expanded so children are reachable without a first tap
  private readonly openGroups = signal(new Set<string>(NAV.filter((i) => i.kind === 'group').map((i) => i.key)));

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
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
