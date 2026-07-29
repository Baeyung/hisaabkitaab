import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';

@Component({
  selector: 'app-login',
  imports: [FormField, RouterLink, AuthShell],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly model = signal({ identifier: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.identifier);
    required(path.password);
  });

  protected readonly submitting = signal(false);
  protected readonly errorKey = signal<
    'auth.login.invalid' | 'auth.login.locked' | 'auth.login.disabled' | 'error.generic' | null
  >(null);

  constructor() {
    // Arrived here because an admin shut the account mid-session (the interceptor bounced
    // the 401 here). Say so up front, rather than showing a blank form to someone whose
    // password is perfectly correct.
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('reason') === 'disabled') {
      this.errorKey.set('auth.login.disabled');
    }
  }

  async submit(): Promise<void> {
    if (this.loginForm().invalid()) {
      return;
    }
    this.submitting.set(true);
    this.errorKey.set(null);
    try {
      const { identifier, password } = this.model();
      // Set before the call so the verify-pending screen has it if the account is unverified
      // (the auth interceptor redirects there on a 403 ACCOUNT_UNVERIFIED).
      this.store.setPendingIdentifier(identifier);
      await this.auth.login(identifier, password);
      this.router.navigate(['/']);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const code = (err as { error?: { error?: string } }).error?.error;
      if (status === 403 && code === 'ACCOUNT_UNVERIFIED') {
        return; // interceptor already routed to /verify-pending
      }
      if (status === 401) {
        // Two 401s the user can act on: too many wrong passwords (only a password reset
        // opens it again) and an account an admin shut (nothing they can do but ask us).
        // Either way, say so rather than leaving them retrying a password that can't work.
        this.errorKey.set(
          code === 'ACCOUNT_LOCKED'
            ? 'auth.login.locked'
            : code === 'ACCOUNT_DISABLED'
              ? 'auth.login.disabled'
              : 'auth.login.invalid',
        );
        return;
      }
      this.errorKey.set('error.generic');
    } finally {
      this.submitting.set(false);
    }
  }
}
