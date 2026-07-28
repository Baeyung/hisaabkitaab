import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { form, FormField, required, pattern } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';
import { DigitsOnly } from '../../../shared/digits-only';

const RESEND_COOLDOWN_SECONDS = 40;
const OTP_LENGTH = 6;
const OTP_PATTERN = /^\d{6}$/;

/**
 * Landing screen for an account that has signed up but not yet verified its email.
 * Shows where the code was sent, takes the 6-digit code, and can resend it — but only
 * once every 40 seconds, enforced here as a simple countdown (the backend is not throttled).
 *
 * On success the account is verified and the stored credentials (kept by signup, and by
 * login when it hit ACCOUNT_UNVERIFIED) now pass the backend's gate, so the user goes
 * straight into the app without logging in again.
 */
@Component({
  selector: 'app-verify-pending',
  imports: [FormField, AuthShell, DigitsOnly],
  template: `
    <app-auth-shell>
      <div class="auth__head">
        <h1>{{ locale.t('auth.verifyPending.title') }}</h1>
        <p>{{ locale.t('auth.verifyPending.subtitle') }}</p>
      </div>

      @if (identifier()) {
        <div class="auth__callout">
          <span class="lbl">{{ locale.t('auth.verifyPending.sentTo') }}</span>
          <span class="num">{{ identifier() }}</span>
        </div>
      }

      <form class="auth__form" (submit)="$event.preventDefault(); submit()">
        <div class="fld">
          <label class="fld__label" for="verify-otp">{{ locale.t('auth.verifyPending.otp') }}</label>
          <!-- One real input, six painted cells. The input keeps paste, native
               one-time-code autofill and the caret; the cells just mirror it. -->
          <div class="otp" [class.otp--err]="invalidOtp()">
            <input
              #otpInput
              id="verify-otp"
              class="otp__input"
              [formField]="otpForm.otp"
              [maxDigits]="OTP_LENGTH"
              type="tel"
              inputmode="numeric"
              autocomplete="one-time-code"
              autofocus
              (input)="invalidOtp.set(false)"
              (focus)="focused.set(true)"
              (blur)="focused.set(false)"
            />
            @for (digit of cells(); track $index) {
              <div
                class="otp__cell"
                [class.otp__cell--on]="digit"
                [class.otp__cell--at]="focused() && $index === caret()"
                aria-hidden="true"
              >
                {{ digit }}
              </div>
            }
          </div>
        </div>

        @if (invalidOtp()) {
          <p role="alert" class="auth__alert">{{ locale.t('auth.verifyPending.otpInvalid') }}</p>
        }

        <button class="auth__cta" type="submit" [disabled]="submitting() || otpForm().invalid()">
          {{ locale.t('auth.verifyPending.submit') }}
        </button>
      </form>

      <p class="auth__foot">
        <button type="button" [disabled]="!canResend()" (click)="resend()">
          {{
            canResend()
              ? locale.t('auth.verifyPending.resend')
              : locale.t('auth.verifyPending.resendIn', { time: countdown() })
          }}
        </button>
      </p>

      @if (resent()) {
        <p role="status" class="auth__hint">{{ locale.t('auth.verifyPending.resent') }}</p>
      }

      <p class="auth__foot">
        <button type="button" (click)="backToLogin()">
          {{ locale.t('auth.verifyPending.toLogin') }}
        </button>
      </p>
    </app-auth-shell>
  `,
})
export class VerifyPending implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly identifier = this.store.pendingIdentifier;
  protected readonly model = signal({ otp: '' });
  protected readonly otpForm = form(this.model, (path) => {
    required(path.otp);
    pattern(path.otp, OTP_PATTERN);
  });

  protected readonly OTP_LENGTH = OTP_LENGTH;
  protected readonly focused = signal(false);
  private readonly otpInput = viewChild.required<ElementRef<HTMLInputElement>>('otpInput');
  /** One slot per digit; empty string where nothing has been typed yet. */
  protected readonly cells = computed(() => {
    const otp = this.model().otp;
    return Array.from({ length: OTP_LENGTH }, (_, i) => otp[i] ?? '');
  });
  /** The cell the real (hidden) caret sits in; parks on the last one when full. */
  protected readonly caret = computed(() =>
    Math.min(this.model().otp.length, OTP_LENGTH - 1),
  );

  protected readonly submitting = signal(false);
  protected readonly invalidOtp = signal(false);
  protected readonly resent = signal(false);
  private readonly secondsLeft = signal(RESEND_COOLDOWN_SECONDS);
  private timer?: ReturnType<typeof setInterval>;

  protected readonly canResend = computed(() => this.secondsLeft() === 0);
  protected readonly countdown = computed(() => {
    const s = this.secondsLeft();
    const mm = Math.floor(s / 60);
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  });

  constructor() {
    this.startCooldown();
  }

  async submit(): Promise<void> {
    const id = this.identifier();
    if (this.otpForm().invalid() || this.submitting() || !id) {
      return;
    }
    this.submitting.set(true);
    this.invalidOtp.set(false);
    this.resent.set(false);
    try {
      await this.auth.verifyOtp(id, this.model().otp);
      // Credentials survive from signup/login, so the app is reachable straight away.
      // Without them (arrived here cold) the user still has to log in.
      this.router.navigate([this.store.isAuthenticated() ? '/' : '/login']);
    } catch {
      this.invalidOtp.set(true);
      // Rejected: put the caret back so the next code can be typed straight away.
      this.otpInput().nativeElement.focus();
    } finally {
      this.submitting.set(false);
    }
  }

  /** Abandon verification: clear the stored (unverified) session so publicOnlyGuard lets /login through. */
  backToLogin(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  async resend(): Promise<void> {
    const id = this.identifier();
    if (!this.canResend() || !id) {
      return;
    }
    this.resent.set(false);
    this.invalidOtp.set(false);
    // The old code is dead now, so don't leave it sitting in the box.
    this.model.set({ otp: '' });
    await this.auth.resendVerification(id);
    this.resent.set(true);
    this.startCooldown();
  }

  private startCooldown(): void {
    clearInterval(this.timer);
    this.secondsLeft.set(RESEND_COOLDOWN_SECONDS);
    this.timer = setInterval(() => {
      const next = this.secondsLeft() - 1;
      this.secondsLeft.set(next);
      if (next <= 0) {
        clearInterval(this.timer);
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
