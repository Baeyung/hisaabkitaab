import { Component } from '@angular/core';
import { GoodsEntry, GoodsEntryConfig } from './goods-entry';

/**
 * SALE entry (فروخت) — cloth leaves the shop and cash comes into the drawer;
 * anything unpaid becomes the party's baqaya. See {@link GoodsEntry} for the
 * shared surface.
 */
@Component({
  selector: 'app-sale',
  imports: [GoodsEntry],
  template: `<app-goods-entry [config]="config" />`,
})
export class Sale {
  protected readonly config: GoodsEntryConfig = {
    idPrefix: 'sale',
    eventType: 'SALE',
    drawerFlow: 'in',
    ratePrefill: 'salePrice',
    labels: {
      newEntry: 'sale.newEntry',
      title: 'nav.sale',
      party: 'sale.party',
      partyPh: 'sale.party.ph',
      partyCashToggle: 'sale.party.cashToggle',
      partyCash: 'sale.party.cash',
      lines: 'sale.lines',
      colDesign: 'sale.col.design',
      colDesignPh: 'sale.col.design.ph',
      colQty: 'sale.col.qty',
      colRate: 'sale.col.rate',
      colAmount: 'sale.col.amount',
      lineRemove: 'sale.line.remove',
      lineAdd: 'sale.line.add',
      total: 'sale.total',
      cash: 'sale.received',
      billNumber: 'sale.billNumber',
      billNumberPh: 'sale.billNumber.ph',
      description: 'sale.description',
      descriptionPh: 'sale.description.ph',
      clear: 'sale.clear',
      saveNext: 'sale.saveNext',
      effect: 'sale.effect',
      effectDrawer: 'sale.effect.drawer',
      effectStock: 'sale.effect.stock',
      effectOutstanding: 'sale.effect.theyOwe',
      effectOverpaid: 'sale.effect.youOwe',
      effectSettled: 'sale.effect.settled',
      effectEmpty: 'sale.effect.empty',
      recent: 'sale.recent',
      recentLabel: 'sale.recent.sale',
      recentCash: 'sale.recent.received',
    },
  };
}
