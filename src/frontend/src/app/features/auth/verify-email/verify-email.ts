import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { TranslationKey } from '../../../core/i18n/translations/en';
import { AuthShell } from '../auth-shell/auth-shell';

type State = 'verifying' | 'success' | 'error';

const TITLE_KEYS: Record<State, TranslationKey> = {
  verifying: 'auth.verifyEmail.verifying.title',
  success: 'auth.verifyEmail.success.title',
  error: 'auth.verifyEmail.error.title',
};

const BODY_KEYS: Record<State, TranslationKey> = {
  verifying: 'auth.verifyEmail.verifying.body',
  success: 'auth.verifyEmail.success.body',
  error: 'auth.verifyEmail.error.body',
};

/**
 * Target of the link in the verification email (/verify/:token). Confirms the token
 * against the backend, then tells the user to head back to the app and log in.
 */
@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, AuthShell],
  template: `
    <app-auth-shell>
      <div class="auth__head">
        <h1>{{ locale.t(titleKey()) }}</h1>
        <p>{{ locale.t(bodyKey()) }}</p>
      </div>

      @if (state() !== 'verifying') {
        <div class="auth__stack">
          <a class="auth__cta" routerLink="/login">{{ locale.t('auth.verifyEmail.toLogin') }}</a>
        </div>
      }
    </app-auth-shell>
  `,
})
export class VerifyEmail {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  protected readonly locale = inject(LocaleService);

  protected readonly state = signal<State>('verifying');
  protected readonly titleKey = computed(() => TITLE_KEYS[this.state()]);
  protected readonly bodyKey = computed(() => BODY_KEYS[this.state()]);

  constructor() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.state.set('error');
      return;
    }
    this.auth
      .verifyEmail(token)
      .then(() => this.state.set('success'))
      .catch(() => this.state.set('error'));
  }
}
