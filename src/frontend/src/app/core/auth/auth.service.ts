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

  logout(): void {
    this.store.clear();
  }
}
