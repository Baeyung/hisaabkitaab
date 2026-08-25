import { Component } from '@angular/core';
import { PURCHASE_INVOICE_LABELS } from '../../shared/bill-invoice';
import { DocConfig } from '../transaction-docs/doc-config';
import { DocList } from '../transaction-docs/doc-list';

/**
 * What a purchase is, in the shared goods-document screens' terms: the PURCHASE
 * side, and the mirror of {@link ../bill-management/bill-management#BILL_DOC}.
 * Exported because the detail screen reads the same config.
 */
export const PURCHASE_DOC: DocConfig = {
  kind: 'purchases',
  route: 'purchases',
  entryRoute: 'new-entry/purchase',
  // An unpaid purchase is money you owe the supplier — the sale's mirror.
  owing: 'YOU_OWE_THEM',
  invoice: PURCHASE_INVOICE_LABELS,
  labels: {
    title: 'nav.purchases',
    subtitle: 'purchases.subtitle',
    new: 'purchases.new',
    emptyTitle: 'purchases.empty.title',
    emptyBody: 'purchases.empty.body',
    emptyCta: 'purchases.empty.cta',
    loadError: 'purchases.loadError',
    searchPh: 'purchases.search.ph',
    searchNone: 'purchases.search.none',

    printAll: 'bill.printAll',
    printError: 'purchases.printError',
    // "yes" is the report, "no" keeps one record per page.
    printLayout: {
      title: 'bill.printLayout.title',
      body: 'purchases.printLayout.body',
      no: 'purchases.printLayout.records',
      yes: 'bill.printLayout.report',
    },
    printCount: 'purchases.printTotals.count',
    printTotal: 'purchases.printTotals.total',
    printItems: 'print.items.bought',

    colNumber: 'bill.col.number',
    colDate: 'bill.col.date',
    colParty: 'purchases.col.supplier',
    colAmount: 'bill.col.amount',
    colActions: 'bill.col.actions',

    filterFrom: 'bill.filter.from',
    filterTo: 'bill.filter.to',
    filterParty: 'purchases.filter.supplier',
    filterAllParties: 'purchases.filter.allSuppliers',
    filterItem: 'bill.filter.item',
    filterAllItems: 'bill.filter.allItems',

    deleteAction: 'bill.deleteAction',
    deleteConfirm: 'purchases.delete.confirm',
    deleteCancel: 'bill.delete.cancel',
    deleteConfirmBtn: 'bill.delete.confirmBtn',
    deleteError: 'purchases.delete.error',

    detailLoadError: 'purchases.detail.loadError',
    notFound: 'purchases.detail.notFound',
    whatsappDoc: 'whatsapp.doc.purchase',
  },
};

/**
 * Purchase list — every PURCHASE, saved as the record of what a supplier delivered.
 * See {@link DocList} for the shared surface.
 */
@Component({
  selector: 'app-purchases',
  imports: [DocList],
  template: `<app-doc-list [config]="config" />`,
})
export class Purchases {
  protected readonly config = PURCHASE_DOC;
}
