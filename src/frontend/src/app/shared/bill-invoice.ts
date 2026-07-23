import { Component, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { BillDetail } from '../core/store/bill.models';
import { directionClass, directionKey } from './balance.util';

/**
 * One bill rendered as an invoice — header (bill no., date, bill-to), the
 * line-items table and the totals footer. Purely presentational: the parent
 * owns loading/toolbar/delete chrome. Used by the single bill view and by the
 * "print all bills" batch, so the two stay identical.
 */
@Component({
  selector: 'app-bill-invoice',
  imports: [],
  templateUrl: './bill-invoice.html',
})
export class BillInvoice {
  readonly bill = input.required<BillDetail>();

  protected readonly locale = inject(LocaleService);
  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;
}
