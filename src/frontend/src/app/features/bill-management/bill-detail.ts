import { Component, input } from '@angular/core';
import { DocDetail } from '../transaction-docs/doc-detail';
import { BILL_DOC } from './bill-management';

/**
 * One bill, derived from its SALE transaction. The transaction id arrives via
 * router input binding and is handed to the shared {@link DocDetail}.
 */
@Component({
  selector: 'app-bill-detail',
  imports: [DocDetail],
  template: `<app-doc-detail [config]="config" [docId]="billId()" />`,
})
export class BillDetail {
  readonly billId = input.required<string>();

  protected readonly config = BILL_DOC;
}
