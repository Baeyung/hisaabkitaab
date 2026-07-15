import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, email } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/auth/auth.models';
import { LocaleService } from '../../../core/i18n/locale.service';
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';

@Component({
  selector: 'app-signup',
  imports: [FormField, RouterLink, LanguageToggle],
  templateUrl: './signup.html',
})
export class Signup {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly model = signal({ name: '', contactNumber: '', email: '', password: '' });
  protected readonly signupForm = form(this.model, (path) => {
    required(path.name);
    required(path.contactNumber);
    required(path.password);
    email(path.email);
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
      await this.auth.signup(this.model());
      this.router.navigate(['/']);
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
