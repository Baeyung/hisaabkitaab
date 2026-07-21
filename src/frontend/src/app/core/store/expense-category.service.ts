import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** The store's expense heads — the autocomplete source for the expense screen. */
@Injectable({ providedIn: 'root' })
export class ExpenseCategoryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/expense-categories`;

  /** Category names, alphabetical. */
  names(): Promise<string[]> {
    return firstValueFrom(this.http.get<string[]>(this.url));
  }
}
