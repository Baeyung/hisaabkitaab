import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { AdminApi } from './admin-api';

/**
 * Sign-in for the back office. The same account and password as the customer app — being an
 * admin is a matter of the address being listed in the server's `app.admin.emails`, which is
 * why an ordinary user signing in here is told they are not an admin rather than that their
 * password is wrong.
 */
@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
})
export class Login {
  private readonly api = inject(AdminApi);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.api.signIn(this.username().trim(), this.password());
    } catch (failure) {
      this.error.set(describe(failure));
    } finally {
      this.busy.set(false);
    }
  }
}

function describe(failure: unknown): string {
  if (failure instanceof HttpErrorResponse) {
    if (failure.status === 401) {
      return 'Wrong email or password.';
    }
    if (failure.status === 403) {
      return 'That account is not an admin.';
    }
    if (failure.status === 0) {
      return 'Could not reach the server.';
    }
  }
  return 'Something went wrong. Try again.';
}
