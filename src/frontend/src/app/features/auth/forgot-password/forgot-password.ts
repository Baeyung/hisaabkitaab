import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { form, FormField, required, email as emailValidator, pattern } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';

/**
 * Asks for the account's email and requests a reset link. The backend is deliberately
 * silent about whether the email exists, so on submit we always show the same
 * "if it matches, we've sent a link" message — no account enumeration.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [FormField, RouterLink, AuthShell],
  template: `
    <app-auth-shell>
      <div class="auth__head">
        <h1>{{ locale.t('auth.forgot.title') }}</h1>
        <p>{{ locale.t('auth.forgot.subtitle') }}</p>
      </div>

      @if (sent()) {
        <div class="auth__stack">
          <p role="status" class="auth__body">{{ locale.t('auth.forgot.sent') }}</p>
        </div>
      } @else {
        <form class="auth__form" (submit)="$event.preventDefault(); submit()">
          <div class="fld">
            <label class="fld__label" for="forgot-email">{{ locale.t('auth.forgot.email') }}</label>
            <input
              id="forgot-email"
              class="fld__input"
              [formField]="forgotForm.email"
              type="email"
              autocomplete="email"
              inputmode="email"
            />
            @if (forgotForm.email().touched() && forgotForm.email().invalid()) {
              <span role="alert" class="fld__err">{{ locale.t('validation.email') }}</span>
            }
          </div>

          <button class="auth__cta" type="submit" [disabled]="submitting()">
            {{ locale.t('auth.forgot.submit') }}
          </button>
        </form>
      }

      <p class="auth__foot">
        <a routerLink="/login">{{ locale.t('auth.forgot.back') }}</a>
      </p>
    </app-auth-shell>
  `,
})
export class ForgotPassword {
  private readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);

  protected readonly model = signal({ email: '' });
  protected readonly forgotForm = form(this.model, (path) => {
    required(path.email);
    emailValidator(path.email);
    // Mirror the backend and demand a TLD (email() alone accepts "user@localhost").
    pattern(path.email, /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/);
  });

  protected readonly submitting = signal(false);
  protected readonly sent = signal(false);

  async submit(): Promise<void> {
    if (this.forgotForm().invalid()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.auth.requestPasswordReset(this.model().email.trim());
    } finally {
      // Always land on the same confirmation, even on a network error, so we never
      // hint at whether the email is registered.
      this.submitting.set(false);
      this.sent.set(true);
    }
  }
}
