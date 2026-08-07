import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreService } from './store.service';

/** Sends a party their bill or statement on WhatsApp, as the PDF the browser just rendered. */
@Service()
export class WhatsAppService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  /**
   * The number is never sent — the backend reads it off the party, so a tampered request
   * can't redirect a customer's khata to someone else's phone.
   *
   * @param caption what the document is, in the shopkeeper's words; also fills the
   *                approved template's placeholder.
   */
  send(partyId: string, pdf: Blob, filename: string, caption: string): Promise<void> {
    const form = new FormData();
    form.append('document', pdf, filename);
    form.append('caption', caption);
    return firstValueFrom(
      this.http.post<void>(this.stores.api(`parties/${partyId}/whatsapp`), form),
    );
  }
}
