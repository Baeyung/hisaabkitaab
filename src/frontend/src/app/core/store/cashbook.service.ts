import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CashbookDay } from './cashbook.models';

/**
 * The cashbook day view for the signed-in user's store. Store scoping is
 * derived from the principal on the backend; before any store exists the
 * call comes back 404 — callers handle that.
 */
@Injectable({ providedIn: 'root' })
export class CashbookService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/cashbook`;

  getDay(day: string): Promise<CashbookDay> {
    return firstValueFrom(this.http.get<CashbookDay>(this.url, { params: { day } }));
  }
}
