import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Store, StoreDraft } from './store.models';

/**
 * CRUD for the signed-in user's stores. Auth is attached by authInterceptor, so
 * every call here is already scoped to the current owner on the backend.
 */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/stores`;

  list(): Promise<Store[]> {
    return firstValueFrom(this.http.get<Store[]>(this.url));
  }

  create(draft: StoreDraft): Promise<Store> {
    return firstValueFrom(this.http.post<Store>(this.url, draft));
  }

  update(id: string, draft: StoreDraft): Promise<Store> {
    return firstValueFrom(this.http.put<Store>(`${this.url}/${id}`, draft));
  }
}
