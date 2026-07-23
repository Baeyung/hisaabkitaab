import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, email, pattern } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { ApiError } from '../../../core/auth/auth.models';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';
import { DigitsOnly, PHONE_PATTERN } from '../../../shared/digits-only';

@Component({
  selector: 'app-signup',
  imports: [FormField, RouterLink, AuthShell, DigitsOnly],
  templateUrl: './signup.html',
})
export class Signup {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly model = signal({ name: '', contactNumber: '', email: '', password: '' });
  protected readonly signupForm = form(this.model, (path) => {
    required(path.name);
    required(path.contactNumber);
    // DigitsOnly already strips letters at the keyboard; this catches a too
    // short/long number and keeps the rule in step with the backend @Pattern.
    pattern(path.contactNumber, PHONE_PATTERN);
    required(path.password);
    required(path.email);
    email(path.email);
    // email() accepts "user@localhost"; mirror the backend regexp and demand a TLD.
    pattern(path.email, /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/);
  });

  protected readonly submitting = signal(false);
  protected readonly serverFieldErrors = signal<Record<string, string>>({});
  protected readonly errorKey = signal<'auth.signup.exists' | 'error.generic' | null>(null);

  async submit(): Promise<void> {
    if (this.signupForm().invalid()) {
      return;
    }
    this.submitting.set(true);
    this.serverFieldErrors.set({});
    this.errorKey.set(null);
    try {
      const user = await this.auth.signup(this.model());
      if (user.verified) {
        // Verification disabled server-side: account is already usable.
        this.router.navigate(['/']);
      } else {
        const { email, contactNumber } = this.model();
        this.store.setPendingIdentifier(email?.trim() || contactNumber);
        this.router.navigate(['/verify-pending']);
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const body = (err as { error?: ApiError }).error;
      if (status === 400 && body?.fieldErrors) {
        this.serverFieldErrors.set(body.fieldErrors);
      } else if (status === 409) {
        this.errorKey.set('auth.signup.exists');
      } else {
        this.errorKey.set('error.generic');
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
