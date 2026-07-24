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
    const user = await firstValueFrom(
      this.http.get<User>(`${this.apiUrl}/auth/me`, {
        headers: new HttpHeaders({ Authorization: `Basic ${credentials}` }),
      }),
    );
    this.store.setSession(credentials, user);
    return user;
  }

  /** Confirms the account tied to this token. Rejects (404) if the token is unknown/used. */
  async verifyEmail(token: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.apiUrl}/auth/verify/${encodeURIComponent(token)}`, {}),
    );
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
