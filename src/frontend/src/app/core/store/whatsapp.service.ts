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
   * Posts the page, not a file: the backend renders the PDF, so neither the document nor
   * the recipient is the client's to choose — the number is read off the party there.
   *
   * @param caption what the document is, in the shopkeeper's words; also fills the
   *                approved template's placeholder.
   */
  send(partyId: string, html: string, filename: string, caption: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(this.stores.api(`parties/${partyId}/whatsapp`), {
        html,
        filename,
        caption,
      }),
    );
  }
}
