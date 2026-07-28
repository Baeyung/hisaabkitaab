import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';
import { SignupRequest, User } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);
  private readonly apiUrl = environment.apiUrl;

  async signup(req: SignupRequest): Promise<User> {
    const user = await firstValueFrom(
      this.http.post<User>(`${this.apiUrl}/auth/signup`, req),
    );
    const identifier = req.email?.trim() || req.contactNumber;
    this.store.setSession(btoa(`${identifier}:${req.password}`), user);
    return user;
  }

  async login(identifier: string, password: string): Promise<User> {
    const credentials = btoa(`${identifier}:${password}`);
    let user: User;
    try {
      user = await firstValueFrom(
        this.http.get<User>(`${this.apiUrl}/auth/me`, {
          headers: new HttpHeaders({ Authorization: `Basic ${credentials}` }),
        }),
      );
    } catch (err: unknown) {
      // A 403 ACCOUNT_UNVERIFIED means the password was right — the account just hasn't
      // verified yet. Keep the credentials so entering the OTP drops the user straight
      // into the app instead of sending them back to type their password again.
      const e = err as { status?: number; error?: { error?: string } };
      if (e.status === 403 && e.error?.error === 'ACCOUNT_UNVERIFIED') {
        this.store.setCredentials(credentials);
      }
      throw err;
    }
    this.store.setSession(credentials, user);
    return user;
  }

  /**
   * Confirms the account with the 6-digit code from the verification email.
   * Rejects (404) if the code is wrong, expired, or burned by too many wrong guesses.
   */
  async verifyOtp(identifier: string, otp: string): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.apiUrl}/auth/verify`, { identifier, otp }));
  }

  /** Re-sends the verification email. Always resolves (backend is deliberately silent). */
  async resendVerification(identifier: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.apiUrl}/auth/resend-verification`, { identifier }),
    );
  }

  /** Requests a reset link. Always resolves (backend is deliberately silent to avoid leaking which emails exist). */
  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.apiUrl}/auth/forgot-password`, { email }),
    );
  }

  /** Sets a new password using the token from the reset link. Rejects (404) if the token is unknown/expired. */
  async resetPassword(token: string, password: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.apiUrl}/auth/reset-password`, { token, password }),
    );
  }

  logout(): void {
    this.store.clear();
  }
}
