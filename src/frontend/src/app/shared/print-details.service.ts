import { ApplicationRef, Injectable, inject, signal } from '@angular/core';
import { BillService } from '../core/store/bill.service';
import { BillDetail, DocKind } from '../core/store/bill.models';
import { TranslationKey } from '../core/i18n/translations/en';
import { BILL_INVOICE_LABELS, InvoiceLabels, PURCHASE_INVOICE_LABELS } from './bill-invoice';

/** The four strings the print prompt shows — `yes` resolves true, `no` false. */
export interface PrintPromptKeys {
  title: TranslationKey;
  body: TranslationKey;
  no: TranslationKey;
  yes: TranslationKey;
}

/**
 * The question, worded for what the page actually holds: a customer's statement is
 * all bills, a supplier's all purchases, and the cashbook usually both. Asking about
 * bills over a page of purchases reads as someone else's dialog.
 */
const DETAILS_PROMPTS: Record<'bills' | 'purchases' | 'both', PrintPromptKeys> = {
  bills: {
    title: 'common.printDetails.title',
    body: 'common.printDetails.confirm',
    no: 'common.printDetails.without',
    yes: 'common.printDetails.with',
  },
  purchases: {
    title: 'common.printDetails.purchases.title',
    body: 'common.printDetails.purchases.confirm',
    no: 'common.printDetails.without',
    yes: 'common.printDetails.with',
  },
  both: {
    title: 'common.printDetails.both.title',
    body: 'common.printDetails.both.confirm',
    no: 'common.printDetails.without',
    yes: 'common.printDetails.with',
  },
};

/** The ids a screen offers to expand: its SALE rows are bills, its PURCHASE rows purchases. */
export interface ExpandableDocs {
  bills: string[];
  purchases: string[];
}

/** A fetched document that remembers which side of the counter it came from. */
export interface ExpandedDoc extends BillDetail {
  kind: DocKind;
}

/**
 * What the expanded sub-rows call the money on a document. Cash comes in on a bill
 * and goes out on a purchase, and an unbalanced one with no party is a discount you
 * gave or one you were given — same three figures, read from either side.
 */
export const DOC_TOTAL_KEYS: Record<
  DocKind,
  { cash: TranslationKey; outstanding: TranslationKey; discount: TranslationKey }
> = {
  bills: {
    cash: 'bill.detail.cashReceived',
    outstanding: 'bill.detail.outstanding',
    discount: 'bill.detail.discount',
  },
  purchases: {
    cash: 'purchases.detail.cashPaid',
    outstanding: 'purchases.detail.outstanding',
    discount: 'purchases.detail.discount',
  },
};

const KINDS = ['bills', 'purchases'] as const;

/** Full invoice wording per kind — what the appended, jump-linked pages render with. */
export const DOC_INVOICE_LABELS: Record<DocKind, InvoiceLabels> = {
  bills: BILL_INVOICE_LABELS,
  purchases: PURCHASE_INVOICE_LABELS,
};

/** Which side of the counter a printed/sent statement reads correctly from. */
export type Perspective = 'store' | 'party';

const PERSPECTIVE_PROMPT: PrintPromptKeys = {
  title: 'common.perspective.title',
  body: 'common.perspective.confirm',
  no: 'common.perspective.mine',
  yes: 'common.perspective.theirs',
};

/**
 * Print-with-document-details for the cashbook and ledger statement. Both screens
 * list SALE and PURCHASE rows that each stand for a document; on Print we ask (via
 * the themed <app-print-details-dialog> mounted in the shell) whether to attach
 * every one of them as a full invoice page at the end of the printout, jump-linked
 * from its row. The fetched documents live here keyed by transaction id — the
 * templates read `docs().get(row.transactionId)` to tint the row and link it to
 * its appended page — then window.print() runs.
 */
@Injectable({ providedIn: 'root' })
export class PrintDetailsService {
  private readonly api = inject(BillService);
  private readonly appRef = inject(ApplicationRef);

  readonly docs = signal<Map<string, ExpandedDoc>>(new Map());

  /** Drives the themed dialog: true while it's asking, with the wording to show. */
  readonly prompting = signal(false);
  readonly promptKeys = signal<PrintPromptKeys>(DETAILS_PROMPTS.bills);
  private resolve: ((choice: boolean | null) => void) | null = null;

  /** Ask, optionally load every document's lines, then print. */
  async printWithDetails(docs: ExpandableDocs): Promise<void> {
    if (await this.expandDetails(docs)) {
      window.print();
    }
  }

  /**
   * The half of the print flow that shapes the page: ask, load the opted-in documents'
   * lines into `docs()`, and flush them into the DOM. Returns false if the user
   * cancelled, so the caller sends nothing to the printer — or, on the statement's
   * WhatsApp button, to the party.
   *
   * One batch round-trip per kind, and they settle independently: a purchase fetch that
   * fails still lets the bills print expanded. Ids that aren't that kind's documents in
   * this store are dropped server-side, so a mixed list costs nothing to send.
   */
  async expandDetails(docs: ExpandableDocs): Promise<boolean> {
    const kinds = KINDS.filter((kind) => docs[kind].length > 0);

    let withDetails = false;
    if (kinds.length > 0) {
      const choice = await this.ask(DETAILS_PROMPTS[kinds.length === 2 ? 'both' : kinds[0]]);
      if (choice === null) {
        return false; // cancelled — don't print at all
      }
      withDetails = choice;
    }

    const fetched = new Map<string, ExpandedDoc>();
    if (withDetails) {
      const results = await Promise.allSettled(
        kinds.map((kind) => this.api.getDetails(kind, docs[kind])),
      );
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          for (const doc of result.value) {
            fetched.set(doc.id, { ...doc, kind: kinds[i] });
          }
        }
      });
    }
    this.docs.set(fetched);
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
  ask(keys: PrintPromptKeys = DETAILS_PROMPTS.bills): Promise<boolean | null> {
    this.promptKeys.set(keys);
    this.prompting.set(true);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /**
   * Asked before a single-party document goes to print or WhatsApp — the shop's
   * own view by default (cancel/backdrop included), the party's only when they
   * actively choose it, since nobody expects an unanswered prompt to change what
   * they were about to print.
   */
  async askPerspective(): Promise<Perspective> {
    return (await this.ask(PERSPECTIVE_PROMPT)) === true ? 'party' : 'store';
  }

  /** Called by the dialog: true/false = a choice, null = cancelled. */
  answer(choice: boolean | null): void {
    this.prompting.set(false);
    this.resolve?.(choice);
    this.resolve = null;
  }
}
