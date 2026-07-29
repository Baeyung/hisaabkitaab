import { Injectable, computed, signal } from '@angular/core';

const CREDS_KEY = 'hk.admin.creds';
const EMAIL_KEY = 'hk.admin.email';

/**
 * The signed-in admin, such as it is: HTTP Basic credentials in localStorage, exactly like
 * the user app. There is no token to expire — the backend re-checks the password and the
 * {@code app.admin.emails} allowlist on every single request, so revoking an admin is a
 * config change that takes effect on their next click.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _credentials = signal<string | null>(localStorage.getItem(CREDS_KEY));
  private readonly _email = signal<string | null>(localStorage.getItem(EMAIL_KEY));

  readonly credentials = this._credentials.asReadonly();
  readonly email = this._email.asReadonly();
  readonly isAuthenticated = computed(() => this._credentials() !== null);

  setSession(credentials: string, email: string): void {
    localStorage.setItem(CREDS_KEY, credentials);
    localStorage.setItem(EMAIL_KEY, email);
    this._credentials.set(credentials);
    this._email.set(email);
  }

  clear(): void {
    localStorage.removeItem(CREDS_KEY);
    localStorage.removeItem(EMAIL_KEY);
    this._credentials.set(null);
    this._email.set(null);
  }
}
