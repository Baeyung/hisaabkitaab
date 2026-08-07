import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../environments/environment';

export type PlanTier = 'TRIAL' | 'BASIC' | 'PREMIUM' | 'PREMIUM_PLUS' | 'ENTERPRISE';

/** Null in `overrides` means "left to the tier"; in `limits` every field is filled in. */
export interface PlanLimits {
  maxStores: number | null;
  maxUsers: number | null;
  whatsappQuota: number | null;
}

export interface Plan {
  tier: PlanTier;
  assignedAt: string;
  /** Null while the trial's clock has not started — nothing enforces plans yet. */
  expiresAt: string | null;
  expired: boolean;
  limits: PlanLimits;
  overrides: PlanLimits;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  contactNumber: string;
  verified: boolean;
  status: 'ACTIVE' | 'INVITED';
  /** Null for an INVITED placeholder — nobody has signed up as that address yet. */
  plan: Plan | null;
}

export interface PlanTierInfo {
  tier: PlanTier;
  maxStores: number;
  maxUsers: number;
  whatsappQuota: number;
}

export interface AssignPlanRequest {
  tier: PlanTier;
  expiresAt: string;
  maxStores?: number | null;
  maxUsers?: number | null;
  whatsappQuota?: number | null;
}

const CREDENTIALS_KEY = 'hk-admin-credentials';

/**
 * The back office's only network layer. The backend speaks HTTP Basic, so there is no token to
 * refresh and no session to keep alive — the credentials ride on every request.
 *
 * <p>They live in sessionStorage rather than localStorage on purpose: closing the tab is a
 * logout, which is the behaviour you want from a screen that can change what customers are
 * paying for.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin`;

  /** Base64 `user:password`, or null when signed out. Drives which screen the app shows. */
  readonly credentials = signal<string | null>(sessionStorage.getItem(CREDENTIALS_KEY));

  /**
   * Verifies the credentials before keeping them, by fetching something only an admin may see —
   * so a wrong password (401) and an ordinary user's password (403) both fail here rather than
   * on the first screen the user lands on.
   */
  async signIn(username: string, password: string): Promise<void> {
    const token = encodeCredentials(username, password);

    await firstValueFrom(
      this.http.get<PlanTierInfo[]>(`${this.base}/plan-tiers`, { headers: authHeader(token) }),
    );

    sessionStorage.setItem(CREDENTIALS_KEY, token);
    this.credentials.set(token);
  }

  signOut(): void {
    sessionStorage.removeItem(CREDENTIALS_KEY);
    this.credentials.set(null);
  }

  /** Every account and its plan. An empty query lists everyone. */
  users(query: string): Promise<AdminUser[]> {
    return firstValueFrom(
      this.http.get<AdminUser[]>(`${this.base}/users`, {
        headers: this.authenticated(),
        params: { q: query },
      }),
    );
  }

  planTiers(): Promise<PlanTierInfo[]> {
    return firstValueFrom(
      this.http.get<PlanTierInfo[]>(`${this.base}/plan-tiers`, { headers: this.authenticated() }),
    );
  }

  assignPlan(userId: string, request: AssignPlanRequest): Promise<Plan> {
    return firstValueFrom(
      this.http.put<Plan>(`${this.base}/users/${userId}/plan`, request, {
        headers: this.authenticated(),
      }),
    );
  }

  private authenticated(): HttpHeaders {
    const token = this.credentials();
    if (!token) {
      throw new Error('Not signed in');
    }
    return authHeader(token);
  }
}

function authHeader(token: string): HttpHeaders {
  return new HttpHeaders({ Authorization: `Basic ${token}` });
}

/**
 * Basic auth carries UTF-8, but `btoa` only accepts Latin-1 and throws on anything else — so a
 * password with an accent or an Urdu character would break sign-in outright. Encode to UTF-8
 * bytes first, then base64 those.
 */
function encodeCredentials(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return btoa(String.fromCharCode(...bytes));
}
