import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ProcessingRequest, ProcessingRow } from './processing.models';
import { StoreService } from './store.service';

/**
 * Processed-goods batches in the store the user is currently in.
 *
 * No delete of its own: a batch is an ordinary transaction, so `EventService.deleteEvent`
 * takes it back — and no update, because correcting one is delete + re-enter (the backend
 * refuses a PUT; see its `EventService`).
 */
@Injectable({ providedIn: 'root' })
export class ProcessingService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  private get url(): string {
    return this.stores.api('processing');
  }

  list(): Promise<ProcessingRow[]> {
    return firstValueFrom(this.http.get<ProcessingRow[]>(this.url));
  }

  process(request: ProcessingRequest): Promise<void> {
    return firstValueFrom(this.http.post<void>(this.url, request));
  }
}
