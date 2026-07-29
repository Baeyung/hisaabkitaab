import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';

export interface AccessEvent {
  disabled: boolean;
  actor: string;
  reason: string | null;
  at: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  contactNumber: string;
  verified: boolean;
  disabled: boolean;
  admin: boolean;
  history: AccessEvent[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);
  private readonly apiUrl = environment.apiUrl;

  /**
   * Signs in by doing the first real thing an admin does. There is no login endpoint: a 200
   * means the password checked out *and* the account holds ROLE_ADMIN, a 401 means bad
   * credentials, and a 403 means a valid HisaabKitaab account that simply isn't an admin.
   */
  async login(identifier: string, password: string): Promise<AdminUser[]> {
    const credentials = btoa(`${identifier}:${password}`);
    const users = await firstValueFrom(
      this.http.get<AdminUser[]>(`${this.apiUrl}/admin/users`, {
        headers: new HttpHeaders({ Authorization: `Basic ${credentials}` }),
      }),
    );
    this.store.setSession(credentials, identifier);
    return users;
  }

  /** Every account, for the picker. History is empty here — see {@link detail}. */
  users(): Promise<AdminUser[]> {
    return firstValueFrom(this.http.get<AdminUser[]>(`${this.apiUrl}/admin/users`));
  }

  /** One account with its full lock/unlock history. */
  detail(id: string): Promise<AdminUser> {
    return firstValueFrom(this.http.get<AdminUser>(`${this.apiUrl}/admin/users/${id}`));
  }

  /** Locks or unlocks the account; resolves with it, history included. */
  setAccess(id: string, disabled: boolean, reason: string): Promise<AdminUser> {
    return firstValueFrom(
      this.http.put<AdminUser>(`${this.apiUrl}/admin/users/${id}/access`, { disabled, reason }),
    );
  }

  logout(): void {
    this.store.clear();
  }
}
