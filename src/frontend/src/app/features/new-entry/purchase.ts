import { Component } from '@angular/core';
import { GoodsEntry, GoodsEntryConfig } from './goods-entry';

/**
 * PURCHASE entry (خرید) — the mirror of {@link Sale}: cloth arrives into stock
 * and cash leaves the drawer; anything left unpaid is what you owe the supplier.
 * See {@link GoodsEntry} for the shared surface.
 */
@Component({
  selector: 'app-purchase',
  imports: [GoodsEntry],
  template: `<app-goods-entry [config]="config" />`,
})
export class Purchase {
  protected readonly config: GoodsEntryConfig = {
    idPrefix: 'purchase',
    eventType: 'PURCHASE',
    drawerFlow: 'out',
    ratePrefill: 'costPrice',
    labels: {
      newEntry: 'purchase.newEntry',
      title: 'nav.purchase',
      party: 'purchase.party',
      partyPh: 'purchase.party.ph',
      partyCashToggle: 'purchase.party.cashToggle',
      partyCash: 'purchase.party.cash',
      lines: 'purchase.lines',
      colDesign: 'purchase.col.design',
      colDesignPh: 'purchase.col.design.ph',
      colQty: 'purchase.col.qty',
      colRate: 'purchase.col.rate',
      colAmount: 'purchase.col.amount',
      lineRemove: 'purchase.line.remove',
      lineAdd: 'purchase.line.add',
      total: 'purchase.total',
      cash: 'purchase.paid',
      billNumber: 'purchase.billNumber',
      billNumberPh: 'purchase.billNumber.ph',
      description: 'purchase.description',
      descriptionPh: 'purchase.description.ph',
      clear: 'purchase.clear',
      saveNext: 'purchase.saveNext',
      effect: 'purchase.effect',
      effectDrawer: 'purchase.effect.drawer',
      effectStock: 'purchase.effect.stock',
      effectOutstanding: 'purchase.effect.youOwe',
      effectOverpaid: 'purchase.effect.theyOwe',
      effectSettled: 'purchase.effect.settled',
      effectEmpty: 'purchase.effect.empty',
      recent: 'purchase.recent',
      recentLabel: 'purchase.recent.purchase',
      recentCash: 'purchase.recent.paid',
    },
  };
}
