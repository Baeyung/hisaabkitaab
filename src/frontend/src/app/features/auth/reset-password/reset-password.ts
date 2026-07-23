import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';

/**
 * Target of the link in the reset email (/reset-password/:token). Takes a new password
 * and sends it with the token. A 404 means the token is unknown or expired, so we point
 * the user back to request a fresh link.
 */
@Component({
  selector: 'app-reset-password',
  imports: [FormField, RouterLink, AuthShell],
  template: `
    <app-auth-shell>
      <div class="auth__head">
        <h1>{{ locale.t('auth.reset.title') }}</h1>
        <p>{{ locale.t(success() ? 'auth.reset.doneSubtitle' : 'auth.reset.subtitle') }}</p>
      </div>

      @if (success()) {
        <div class="auth__stack">
          <button class="auth__cta" type="button" (click)="goToLogin()">
            {{ locale.t('auth.reset.toLogin') }}
          </button>
        </div>
      } @else {
        <form class="auth__form" (submit)="$event.preventDefault(); submit()">
          <div class="fld">
            <label class="fld__label" for="reset-password">{{ locale.t('auth.reset.password') }}</label>
            <input
              id="reset-password"
              class="fld__input"
              [formField]="resetForm.password"
              type="password"
              autocomplete="new-password"
            />
          </div>

          @if (invalidLink()) {
            <p role="alert" class="auth__alert">{{ locale.t('auth.reset.invalid') }}</p>
          }

          <button class="auth__cta" type="submit" [disabled]="submitting() || !token">
            {{ locale.t('auth.reset.submit') }}
          </button>
        </form>

        @if (invalidLink()) {
          <p class="auth__foot">
            <a routerLink="/forgot-password">{{ locale.t('auth.reset.requestNew') }}</a>
          </p>
        }
      }
    </app-auth-shell>
  `,
})
export class ResetPassword {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly token = this.route.snapshot.paramMap.get('token');
  protected readonly model = signal({ password: '' });
  protected readonly resetForm = form(this.model, (path) => {
    required(path.password);
  });

  protected readonly submitting = signal(false);
  protected readonly success = signal(false);
  protected readonly invalidLink = signal(false);

  async submit(): Promise<void> {
    if (this.resetForm().invalid() || !this.token) {
      return;
    }
    this.submitting.set(true);
    this.invalidLink.set(false);
    try {
      await this.auth.resetPassword(this.token, this.model().password);
      this.success.set(true);
    } catch {
      this.invalidLink.set(true);
    } finally {
      this.submitting.set(false);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
