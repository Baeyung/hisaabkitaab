import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';

/**
 * Password reset is manual for now: this screen points the shopkeeper at the
 * support line to call/message from their registered number. No form — the
 * phone number is the one action.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [RouterLink, AuthShell],
  template: `
    <app-auth-shell>
      <div class="auth__head">
        <h1>{{ locale.t('auth.forgot.title') }}</h1>
      </div>

      <div class="auth__stack">
        <p class="auth__body">{{ locale.t('auth.forgot.body') }}</p>

        <div class="auth__callout">
          <span class="lbl">{{ locale.t('auth.forgot.calloutLabel') }}</span>
          <a class="tel num" [href]="'tel:' + telHref">{{ telDisplay }}</a>
        </div>

        <a class="auth__cta" [href]="'tel:' + telHref">{{ locale.t('auth.forgot.cta') }}</a>

        <p class="auth__hint">{{ locale.t('auth.forgot.hint') }}</p>
      </div>

      <p class="auth__foot">
        <a routerLink="/login">{{ locale.t('auth.forgot.back') }}</a>
      </p>
    </app-auth-shell>
  `,
})
export class ForgotPassword {
  protected readonly locale = inject(LocaleService);
  protected readonly telHref = '+923394010046';
  protected readonly telDisplay = '+92 339 401 0046';
}
