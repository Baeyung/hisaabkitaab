import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { BillService } from '../core/store/bill.service';
import { BillDetail } from '../core/store/bill.models';
import { TranslationKey } from '../core/i18n/translations/en';

/** The four strings the print prompt shows — `yes` resolves true, `no` false. */
export interface PrintPromptKeys {
  title: TranslationKey;
  body: TranslationKey;
  no: TranslationKey;
  yes: TranslationKey;
}

const DETAILS_PROMPT: PrintPromptKeys = {
  title: 'common.printDetails.title',
  body: 'common.printDetails.confirm',
  no: 'common.printDetails.without',
  yes: 'common.printDetails.with',
};

/**
 * Print-with-bill-details for the cashbook and ledger statement. Both screens
 * list SALE rows that each stand for a bill; on Print we ask (via the themed
 * <app-print-details-dialog> mounted in the shell) whether to expand every
 * bill's line items as sub-rows beneath its row. The fetched bills live here
 * keyed by id — the templates read `bills().get(row.transactionId)` to render
 * the print-only sub-rows — then window.print() runs.
 *
 * ponytail: one GET per SALE bill (no batch endpoint), fetched only when the
 * user opts in. Fine for a day/statement of bills; add a batch fetch if someone
 * prints huge ranges.
 */
@Injectable({ providedIn: 'root' })
export class PrintDetailsService {
  private readonly api = inject(BillService);
  private readonly appRef = inject(ApplicationRef);

  readonly bills = signal<Map<string, BillDetail>>(new Map());

  /** Drives the themed dialog: true while it's asking, with the wording to show. */
  readonly prompting = signal(false);
  readonly promptKeys = signal<PrintPromptKeys>(DETAILS_PROMPT);
  private resolve: ((choice: boolean | null) => void) | null = null;

  /** Ask, optionally load every bill's lines, then print. */
  async printWithDetails(saleIds: string[]): Promise<void> {
    if (await this.expandDetails(saleIds)) {
      window.print();
    }
  }

  /**
   * The half of the print flow that shapes the page: ask, load the opted-in bills' lines
   * into `bills()`, and flush them into the DOM. Returns false if the user cancelled, so
   * the caller sends nothing to the printer — or, on the statement's WhatsApp button, to
   * the party.
   */
  async expandDetails(saleIds: string[]): Promise<boolean> {
    let withDetails = false;
    if (saleIds.length > 0) {
      const choice = await this.ask();
      if (choice === null) {
        return false; // cancelled — don't print at all
      }
      withDetails = choice;
    }

    if (withDetails) {
      const results = await Promise.allSettled(saleIds.map((id) => this.api.getDetail(id)));
      const map = new Map<string, BillDetail>();
      for (const r of results) {
        if (r.status === 'fulfilled') {
          map.set(r.value.id, r.value);
        }
      }
      this.bills.set(map);
    } else {
      this.bills.set(new Map());
    }
    // Flush change detection first: close the dialog and render the sub-rows
    // into the DOM before anything reads it — otherwise the printer (or the
    // PDF capture) gets the still-open modal / the un-expanded table.
    this.appRef.tick();
    return true;
  }

  /**
   * Open the themed prompt and resolve with the user's choice — true/false for
   * the two buttons, null if they cancelled. Public so screens with their own
   * fetch/print (bill management) can reuse the dialog with their own wording.
   */
  ask(keys: PrintPromptKeys = DETAILS_PROMPT): Promise<boolean | null> {
    this.promptKeys.set(keys);
    this.prompting.set(true);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** Called by the dialog: true/false = a choice, null = cancelled. */
  answer(choice: boolean | null): void {
    this.prompting.set(false);
    this.resolve?.(choice);
    this.resolve = null;
  }
}
