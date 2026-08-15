import { Component, input } from '@angular/core';
import { DocDetail } from '../transaction-docs/doc-detail';
import { PURCHASE_DOC } from './purchases';

/**
 * One purchase, derived from its PURCHASE transaction. The transaction id arrives
 * via router input binding and is handed to the shared {@link DocDetail}.
 */
@Component({
  selector: 'app-purchase-detail',
  imports: [DocDetail],
  template: `<app-doc-detail [config]="config" [docId]="purchaseId()" />`,
})
export class PurchaseDetail {
  readonly purchaseId = input.required<string>();

  protected readonly config = PURCHASE_DOC;
}
