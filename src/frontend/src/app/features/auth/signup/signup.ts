import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, email, pattern } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { ApiError } from '../../../core/auth/auth.models';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AuthShell } from '../auth-shell/auth-shell';
import { PHONE_PATTERN } from '../../../shared/digits-only';
import { PhoneField } from '../../../shared/phone-field/phone-field';
import { PasswordField, PASSWORD_PATTERN } from '../../../shared/password-field/password-field';

@Component({
  selector: 'app-signup',
  imports: [FormField, RouterLink, AuthShell, PhoneField, PasswordField],
  templateUrl: './signup.html',
})
export class Signup {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly model = signal({
    name: '',
    contactNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  protected readonly signupForm = form(this.model, (path) => {
    required(path.name);
    required(path.contactNumber);
    // DigitsOnly already strips letters at the keyboard; this catches a too
    // short/long number and keeps the rule in step with the backend @Pattern.
    pattern(path.contactNumber, PHONE_PATTERN);
    required(path.password);
    // The checklist under the field says which part is missing; this is the gate.
    pattern(path.password, PASSWORD_PATTERN);
    required(path.confirmPassword);
    required(path.email);
    email(path.email);
    // email() accepts "user@localhost"; mirror the backend regexp and demand a TLD.
    pattern(path.email, /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/);
  });

  /** Both filled and different — a typo in one of them. */
  protected readonly mismatch = computed(() => {
    const { password, confirmPassword } = this.model();
    return password !== '' && confirmPassword !== '' && password !== confirmPassword;
  });

  protected readonly submitting = signal(false);
  protected readonly serverFieldErrors = signal<Record<string, string>>({});
  protected readonly errorKey = signal<'auth.signup.exists' | 'error.generic' | null>(null);

  async submit(): Promise<void> {
    if (this.signupForm().invalid() || this.mismatch()) {
      return;
    }
    this.submitting.set(true);
    this.serverFieldErrors.set({});
    this.errorKey.set(null);
    try {
      // confirmPassword never leaves the browser — it only guards against a typo here.
      const { confirmPassword, ...req } = this.model();
      const user = await this.auth.signup(req);
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
