import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/auth/auth.store';
import { LocaleService } from '../../core/i18n/locale.service';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';

@Component({
  selector: 'app-home',
  imports: [LanguageToggle],
  template: `
    <header style="display:flex; justify-content:flex-end; padding:1rem;">
      <app-language-toggle />
    </header>
    <main style="padding:2rem; text-align:center;">
      <h1>{{ locale.t('home.welcome', { name: store.currentUser()?.name ?? '' }) }}</h1>
      <button type="button" (click)="logout()" style="min-height:44px; margin-top:1rem;">
        {{ locale.t('home.logout') }}
      </button>
    </main>
  `,
})
export class Home {
  protected readonly store = inject(AuthStore);
  protected readonly locale = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
