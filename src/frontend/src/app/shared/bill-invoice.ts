import { Component, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { BillDetail } from '../core/store/bill.models';
import { BalanceDirection } from '../core/store/balance.models';
import { directionClass, directionKey, invertDirection } from './balance.util';
import { Perspective } from './print-details.service';

/**
 * The wording of one goods document. Keys are passed in as literals rather than
 * built from a prefix because `TranslationKey` is a union of the dictionary's
 * literal keys — concatenation would need a cast and lose the missing-key check.
 */
export interface InvoiceLabels {
  /** Stands in for the document number when it was saved without one. */
  fallbackTitle: TranslationKey;
  /** Who the document is against: "Bill to" on a sale, "Bought from" on a purchase. */
  counterparty: TranslationKey;
  /** Stands in for the party name when there is none — a walk-in, or a one-off supplier. */
  noParty: TranslationKey;
  empty: TranslationKey;
  goodsTotal: TranslationKey;
  /** The cash side: received from the customer, or paid to the supplier. */
  cash: TranslationKey;
  /** What the document left on the khata, whichever way it runs. */
  outstanding: TranslationKey;
  /** An unbalanced document with nobody on it: a discount given, or one you were given. */
  discount: TranslationKey;
}

/** The sale wording, and the default — every caller that predates purchases means this. */
export const BILL_INVOICE_LABELS: InvoiceLabels = {
  fallbackTitle: 'nav.billManagement',
  counterparty: 'bill.detail.billTo',
  noParty: 'bill.cashSale',
  empty: 'bill.detail.empty',
  goodsTotal: 'bill.detail.goodsTotal',
  cash: 'bill.detail.cashReceived',
  outstanding: 'bill.detail.outstanding',
  discount: 'bill.detail.discount',
};

/**
 * One goods document rendered as an invoice — header (number, date, who it is
 * against), the line-items table and the totals footer. Purely presentational:
 * the parent owns loading/toolbar/delete chrome. Used by the single bill and
 * purchase views and by their "print all" batches, so all four stay identical.
 *
 * A sale and a purchase are the same paper read from opposite sides, so only the
 * wording differs — hence {@link labels}, which defaults to the sale's. Callers
 * that only ever show bills (the cashbook and statement printouts) leave it alone.
 */
@Component({
  selector: 'app-bill-invoice',
  imports: [],
  templateUrl: './bill-invoice.html',
})
export class BillInvoice {
  readonly bill = input.required<BillDetail>();
  readonly labels = input<InvoiceLabels>(BILL_INVOICE_LABELS);
  /** Store's own view by default; 'party' flips the outstanding figure's colour/label. */
  readonly perspective = input<Perspective>('store');

  protected readonly locale = inject(LocaleService);

  private sided(direction: BalanceDirection): BalanceDirection {
    return this.perspective() === 'party' ? invertDirection(direction) : direction;
  }

  protected toneKey(direction: BalanceDirection) {
    return directionKey(this.sided(direction));
  }

  protected toneClass(direction: BalanceDirection): string {
    return directionClass(this.sided(direction));
  }
}
