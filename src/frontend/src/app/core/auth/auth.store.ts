import { Injectable, computed, signal } from '@angular/core';
import { User } from './auth.models';

const CREDS_KEY = 'hk.auth.creds';
const PENDING_KEY = 'hk.auth.pendingIdentifier';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _credentials = signal<string | null>(localStorage.getItem(CREDS_KEY));
  private readonly _currentUser = signal<User | null>(null);
  // Contact/email awaiting verification — drives the verify-pending screen (display + resend).
  private readonly _pendingIdentifier = signal<string | null>(localStorage.getItem(PENDING_KEY));

  readonly credentials = this._credentials.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();
  readonly pendingIdentifier = this._pendingIdentifier.asReadonly();
  readonly isAuthenticated = computed(() => this._credentials() !== null);

  setPendingIdentifier(identifier: string): void {
    localStorage.setItem(PENDING_KEY, identifier);
    this._pendingIdentifier.set(identifier);
  }

  setSession(credentials: string, user: User): void {
    localStorage.setItem(CREDS_KEY, credentials);
    this._credentials.set(credentials);
    this._currentUser.set(user);
  }

  setUser(user: User): void {
    this._currentUser.set(user);
  }

  clear(): void {
    localStorage.removeItem(CREDS_KEY);
    this._credentials.set(null);
    this._currentUser.set(null);
  }
}
