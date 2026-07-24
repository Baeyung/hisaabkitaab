import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';

const RESEND_COOLDOWN_SECONDS = 40;

/**
 * Landing screen for an account that has signed up but not yet verified its email.
 * Shows where the link was sent and lets the user resend it — but only once every
 * 40 seconds, enforced here as a simple countdown (the backend is not throttled).
 */
@Component({
  selector: 'app-verify-pending',
  imports: [AuthShell],
  template: `
    <app-auth-shell>
      <div class="auth__head">
        <h1>{{ locale.t('auth.verifyPending.title') }}</h1>
        <p>{{ locale.t('auth.verifyPending.subtitle') }}</p>
      </div>

      <div class="auth__stack">
        @if (identifier()) {
          <div class="auth__callout">
            <span class="lbl">{{ locale.t('auth.verifyPending.sentTo') }}</span>
            <span class="num">{{ identifier() }}</span>
          </div>
        }

        <p class="auth__body">{{ locale.t('auth.verifyPending.body') }}</p>

        <button class="auth__cta" type="button" [disabled]="!canResend()" (click)="resend()">
          {{
            canResend()
              ? locale.t('auth.verifyPending.resend')
              : locale.t('auth.verifyPending.resendIn', { time: countdown() })
          }}
        </button>

        @if (resent()) {
          <p role="status" class="auth__hint">{{ locale.t('auth.verifyPending.resent') }}</p>
        }
      </div>

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
