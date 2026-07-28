import { Component, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, email as emailValidator, pattern } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';
import { OtpBox, OTP_PATTERN } from '../otp-box/otp-box';

const AUTO_LOGIN_SECONDS = 5;

/**
 * The whole password reset, in three steps on one screen: email → code → new password.
 *
 * The backend is deliberately silent about whether an email exists, so step one always
 * moves on to the code step with the same "if it matches, we've sent a code" message —
 * no account enumeration. The code is checked (but not consumed) before the password
 * step, so a wrong code is caught before the user picks a password. The new password is
 * then used to log the user straight in — no reason to make them type it again.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [FormField, RouterLink, AuthShell, OtpBox],
  template: `
    <app-auth-shell>
      <div class="auth__head">
        <h1>{{ locale.t(headingKey()) }}</h1>
        <p>{{ locale.t(subtitleKey()) }}</p>
      </div>

      @switch (step()) {
        @case ('email') {
          <form class="auth__form" (submit)="$event.preventDefault(); sendCode()">
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

        @case ('otp') {
          <div class="auth__callout">
            <span class="lbl">{{ locale.t('auth.forgot.sentTo') }}</span>
            <span class="num">{{ sentTo() }}</span>
          </div>

          <form class="auth__form" (submit)="$event.preventDefault(); verifyCode()">
            <div class="fld">
              <label class="fld__label" for="forgot-otp">{{ locale.t('auth.forgot.otp') }}</label>
              <app-otp-box
                #otpBox
                inputId="forgot-otp"
                [value]="otp()"
                [invalid]="invalidOtp()"
                (valueChange)="onOtpChange($event)"
              />
            </div>

            @if (invalidOtp()) {
              <p role="alert" class="auth__alert">{{ locale.t('auth.forgot.otpInvalid') }}</p>
            }

            <button class="auth__cta" type="submit" [disabled]="submitting() || !otpComplete()">
              {{ locale.t('auth.forgot.verify') }}
            </button>
          </form>

          <p class="auth__hint">{{ locale.t('auth.forgot.sentHint') }}</p>

          <p class="auth__foot">
            <button type="button" (click)="backToEmail()">
              {{ locale.t('auth.forgot.changeEmail') }}
            </button>
          </p>
        }

        @case ('password') {
          <form class="auth__form" (submit)="$event.preventDefault(); setPassword()">
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

            <div class="fld">
              <label class="fld__label" for="reset-confirm">{{ locale.t('auth.reset.confirm') }}</label>
              <input
                id="reset-confirm"
                class="fld__input"
                [formField]="resetForm.confirmPassword"
                type="password"
                autocomplete="new-password"
              />
              @if (resetForm.confirmPassword().touched() && mismatch()) {
                <span role="alert" class="fld__err">{{ locale.t('auth.reset.mismatch') }}</span>
              }
            </div>

            <!-- The code is re-checked on this call, so it can still turn out dead here. -->
            @if (codeExpired()) {
              <p role="alert" class="auth__alert">{{ locale.t('auth.reset.invalid') }}</p>
            }

            <button
              class="auth__cta"
              type="submit"
              [disabled]="submitting() || resetForm().invalid() || mismatch()"
            >
              {{ locale.t('auth.reset.submit') }}
            </button>
          </form>

          @if (codeExpired()) {
            <p class="auth__foot">
              <button type="button" (click)="backToEmail()">
                {{ locale.t('auth.reset.requestNew') }}
              </button>
            </p>
          }
        }

        @case ('done') {
          <div class="auth__stack">
            @if (autoLoginFailed()) {
              <p role="alert" class="auth__alert">{{ locale.t('auth.reset.autoLoginFailed') }}</p>
              <button class="auth__cta" type="button" (click)="goToLogin()">
                {{ locale.t('auth.reset.toLogin') }}
              </button>
            } @else {
              <p role="status" class="auth__hint">
                {{ locale.t('auth.reset.autoLogin', { seconds: countdown() }) }}
              </p>
            }
          </div>
        }
      }

      @if (step() !== 'done') {
        <p class="auth__foot">
          <a routerLink="/login">{{ locale.t('auth.forgot.back') }}</a>
        </p>
      }
    </app-auth-shell>
  `,
})
export class ForgotPassword implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly step = signal<'email' | 'otp' | 'password' | 'done'>('email');

  protected readonly headingKey = computed(() => {
    switch (this.step()) {
      case 'email':
        return 'auth.forgot.title';
      case 'otp':
        return 'auth.forgot.sentTitle';
      case 'password':
        return 'auth.reset.title';
      default:
        return 'auth.reset.doneTitle';
    }
  });

  protected readonly subtitleKey = computed(() => {
    switch (this.step()) {
      case 'email':
        return 'auth.forgot.subtitle';
      case 'otp':
        return 'auth.forgot.sentSubtitle';
      case 'password':
        return 'auth.reset.subtitle';
      default:
        return 'auth.reset.doneSubtitle';
    }
  });

  protected readonly emailModel = signal({ email: '' });
  protected readonly forgotForm = form(this.emailModel, (path) => {
    required(path.email);
    emailValidator(path.email);
    // Mirror the backend and demand a TLD (email() alone accepts "user@localhost").
    pattern(path.email, /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/);
  });

  protected readonly otp = signal('');
  protected readonly otpComplete = computed(() => OTP_PATTERN.test(this.otp()));
  private readonly otpBox = viewChild<OtpBox>('otpBox');

  protected readonly passwordModel = signal({ password: '', confirmPassword: '' });
  protected readonly resetForm = form(this.passwordModel, (path) => {
    required(path.password);
    required(path.confirmPassword);
  });

  /** Both filled and different — a typo in one of them. */
  protected readonly mismatch = computed(() => {
    const { password, confirmPassword } = this.passwordModel();
    return password !== '' && confirmPassword !== '' && password !== confirmPassword;
  });

  protected readonly submitting = signal(false);
  protected readonly invalidOtp = signal(false);
  protected readonly codeExpired = signal(false);
  protected readonly autoLoginFailed = signal(false);
  private readonly secondsLeft = signal(AUTO_LOGIN_SECONDS);
  /** LTR-isolated so the digit doesn't jump sides in the Urdu layout. */
  protected readonly countdown = computed(() => this.locale.formatNumber(this.secondsLeft()));
  private timer?: ReturnType<typeof setInterval>;
  /** The email we sent to, echoed back on the code step and used for both later calls. */
  protected readonly sentTo = signal('');

  async sendCode(): Promise<void> {
    if (this.forgotForm().invalid()) {
      return;
    }
    this.submitting.set(true);
    const email = this.emailModel().email.trim();
    try {
      await this.auth.requestPasswordReset(email);
    } finally {
      this.sentTo.set(email);
      // Always land on the code step, even on a network error, so we never hint at
      // whether the email is registered.
      this.submitting.set(false);
      this.step.set('otp');
    }
  }

  /** Typing clears the rejection so the red row doesn't linger over a fresh code. */
  onOtpChange(otp: string): void {
    this.otp.set(otp);
    this.invalidOtp.set(false);
  }

  async verifyCode(): Promise<void> {
    if (!this.otpComplete() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.invalidOtp.set(false);
    try {
      await this.auth.verifyResetOtp(this.sentTo(), this.otp());
      this.step.set('password');
    } catch {
      this.invalidOtp.set(true);
      // Rejected: put the caret back so the next code can be typed straight away.
      this.otpBox()?.focus();
    } finally {
      this.submitting.set(false);
    }
  }

  async setPassword(): Promise<void> {
    if (this.resetForm().invalid() || this.mismatch() || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.codeExpired.set(false);
    try {
      await this.auth.resetPassword(this.sentTo(), this.otp(), this.passwordModel().password);
      this.step.set('done');
      this.startLoginCountdown();
    } catch {
      this.codeExpired.set(true);
    } finally {
      this.submitting.set(false);
    }
  }

  /** The new password is right here and just proved good, so there's no reason to ask for it again. */
  private startLoginCountdown(): void {
    this.secondsLeft.set(AUTO_LOGIN_SECONDS);
    this.timer = setInterval(() => {
      const next = this.secondsLeft() - 1;
      this.secondsLeft.set(next);
      if (next <= 0) {
        clearInterval(this.timer);
        void this.logIn();
      }
    }, 1000);
  }

  private async logIn(): Promise<void> {
    try {
      await this.auth.login(this.sentTo(), this.passwordModel().password);
      this.router.navigate(['/']);
    } catch {
      // Unverified account, backend down — whatever it was, fall back to the login screen.
      this.autoLoginFailed.set(true);
    }
  }

  /** Start over: a fresh request is the only way past a dead code. */
  backToEmail(): void {
    this.otp.set('');
    this.invalidOtp.set(false);
    this.codeExpired.set(false);
    this.step.set('email');
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
