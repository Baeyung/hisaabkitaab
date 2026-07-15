import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';

@Component({
  selector: 'app-login',
  imports: [FormField, RouterLink, LanguageToggle],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly model = signal({ identifier: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.identifier);
    required(path.password);
  });

  protected readonly submitting = signal(false);
  protected readonly errorKey = signal<'auth.login.invalid' | 'error.generic' | null>(null);

  async submit(): Promise<void> {
    if (this.loginForm().invalid()) {
      return;
    }
    this.submitting.set(true);
    this.errorKey.set(null);
    try {
      const { identifier, password } = this.model();
      await this.auth.login(identifier, password);
      this.router.navigate(['/']);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      this.errorKey.set(status === 401 ? 'auth.login.invalid' : 'error.generic');
    } finally {
      this.submitting.set(false);
    }
  }
}
