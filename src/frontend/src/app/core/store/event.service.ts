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

  /** One entry rebuilt as a request, to prefill the entry screen in edit mode. */
  getEvent(id: string): Promise<EventRequest> {
    return firstValueFrom(this.http.get<EventRequest>(`${this.url}/${id}`));
  }

  /** Correct an entry in place; the backend re-derives its lines from the new values. */
  updateEvent(id: string, event: EventRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.url}/${id}`, event));
  }

  /** Delete an entry of any kind; the backend cascades its lines away. */
  deleteEvent(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url}/${id}`));
  }
}
