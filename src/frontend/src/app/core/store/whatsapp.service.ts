import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StoreService } from './store.service';
import { ShareRecipients, ShareResult, ShareTarget } from './whatsapp.models';

/** Sends the shop's printouts on WhatsApp, as the PDF the browser just rendered. */
@Service()
export class WhatsAppService {
  private readonly http = inject(HttpClient);
  private readonly stores = inject(StoreService);

  /**
   * Who this shop can send to: its owner and the people they have shared it with.
   *
   * @param partyId the party the screen is about, when it is about one — asked after only so
   *                the dialog can say up front that they have opted out.
   */
  recipients(partyId: string | null): Promise<ShareRecipients> {
    return firstValueFrom(
      this.http.get<ShareRecipients>(this.stores.api('whatsapp/recipients'), {
        params: partyId ? { partyId } : {},
      }),
    );
  }

  /**
   * Posts the page, not a file: the backend renders the PDF, so neither the document nor the
   * recipients' numbers are the client's to choose — each recipient is named by id and
   * resolved inside this store there.
   *
   * @param action what is being shared, worded for the reader: "Bill", "Cashbook".
   *               Fills the template's action placeholder, so it is a noun in a sentence.
   * @param locale which language's approved template goes out.
   * @returns how many messages went out, and who was missed — a send to several people can
   *          succeed for some and not others, so this never throws for a failed recipient.
   */
  share(
    recipients: ShareTarget[],
    html: string,
    filename: string,
    action: string,
    locale: string,
  ): Promise<ShareResult> {
    return firstValueFrom(
      this.http.post<ShareResult>(this.stores.api('whatsapp'), {
        html,
        filename,
        action,
        locale,
        recipients,
      }),
    );
  }
}
