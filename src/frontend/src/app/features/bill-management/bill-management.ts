import { Component } from '@angular/core';
import { BILL_INVOICE_LABELS } from '../../shared/bill-invoice';
import { DocConfig } from '../transaction-docs/doc-config';
import { DocList } from '../transaction-docs/doc-list';

/**
 * What a bill is, in the shared goods-document screens' terms: the SALE side.
 * Exported because the detail screen reads the same config — one description of
 * the document, two screens showing it.
 */
export const BILL_DOC: DocConfig = {
  kind: 'bills',
  route: 'bill-management',
  entryRoute: 'new-entry/sale',
  // An unpaid bill is money the customer owes you.
  owing: 'THEY_OWE_YOU',
  invoice: BILL_INVOICE_LABELS,
  labels: {
    title: 'nav.billManagement',
    subtitle: 'bill.subtitle',
    new: 'bill.new',
    emptyTitle: 'bill.empty.title',
    emptyBody: 'bill.empty.body',
    emptyCta: 'bill.empty.cta',
    loadError: 'bill.loadError',
    searchPh: 'bill.search.ph',
    searchNone: 'bill.search.none',

    printAll: 'bill.printAll',
    printError: 'bill.printError',
    // "yes" is the report, "no" keeps the per-bill invoices.
    printLayout: {
      title: 'bill.printLayout.title',
      body: 'bill.printLayout.body',
      no: 'bill.printLayout.invoices',
      yes: 'bill.printLayout.report',
    },
    printCount: 'bill.printTotals.bills',
    printTotal: 'bill.printTotals.revenue',
    printItems: 'print.items.title',

    colNumber: 'bill.col.number',
    colDate: 'bill.col.date',
    colParty: 'bill.col.party',
    colAmount: 'bill.col.amount',
    colActions: 'bill.col.actions',

    filterFrom: 'bill.filter.from',
    filterTo: 'bill.filter.to',
    filterParty: 'bill.filter.party',
    filterAllParties: 'bill.filter.allParties',
    filterItem: 'bill.filter.item',
    filterAllItems: 'bill.filter.allItems',

    deleteAction: 'bill.deleteAction',
    deleteConfirm: 'bill.delete.confirm',
    deleteCancel: 'bill.delete.cancel',
    deleteConfirmBtn: 'bill.delete.confirmBtn',
    deleteError: 'bill.delete.error',

    detailLoadError: 'bill.detail.loadError',
    notFound: 'bill.detail.notFound',
    whatsappDoc: 'whatsapp.doc.bill',
  },
};

/** Bill list — every SALE, saved as a bill. See {@link DocList} for the shared surface. */
@Component({
  selector: 'app-bill-management',
  imports: [DocList],
  template: `<app-doc-list [config]="config" />`,
})
export class BillManagement {
  protected readonly config = BILL_DOC;
}
