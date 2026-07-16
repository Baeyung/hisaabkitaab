import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EventRequest } from './event.models';

/**
 * Posts transaction-entry events (sale, receipt, …) to the backend. The store is
 * derived from the signed-in principal server-side, so nothing here supplies one.
 */
@Injectable({ providedIn: 'root' })
export class EventService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/event`;

  publishEvent(event: EventRequest): Promise<EventRequest> {
    return firstValueFrom(this.http.post<EventRequest>(this.url, event));
  }
}
