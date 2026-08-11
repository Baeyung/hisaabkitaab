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
   * @param action what is being shared, worded for the reader: "Bill", "Khata statement".
   *               Fills the template's action placeholder, so it is a noun in a sentence.
   * @param locale which language's approved template goes out.
   */
  send(
    partyId: string,
    html: string,
    filename: string,
    action: string,
    locale: string,
  ): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(this.stores.api(`parties/${partyId}/whatsapp`), {
        html,
        filename,
        action,
        locale,
      }),
    );
  }
}
