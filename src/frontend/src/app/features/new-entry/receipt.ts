import { Component } from '@angular/core';
import { PartyCashEntry, PartyCashEntryConfig } from './party-cash-entry';

/**
 * RECEIPT entry (وصولی / wasooli) — a party pays down their baqaya, so cash
 * comes into the drawer. See {@link PartyCashEntry} for the shared surface.
 */
@Component({
  selector: 'app-receipt',
  imports: [PartyCashEntry],
  template: `<app-party-cash-entry eventType="RECEIPT" [config]="config" />`,
})
export class Receipt {
  protected readonly config: PartyCashEntryConfig = {
    idPrefix: 'receipt',
    drawerFlow: 'in',
    labels: {
      newEntry: 'receipt.newEntry',
      title: 'nav.receipt',
      party: 'receipt.party',
      partyPh: 'receipt.party.ph',
      partyHint: 'receipt.party.hint',
      partyUnknown: 'receipt.party.unknown',
      amount: 'receipt.amount',
      billNumber: 'receipt.billNumber',
      billNumberPh: 'receipt.billNumber.ph',
      description: 'receipt.description',
      descriptionPh: 'receipt.description.ph',
      clear: 'receipt.clear',
      saveNext: 'receipt.saveNext',
      effect: 'receipt.effect',
      effectDrawer: 'receipt.effect.drawer',
      effectBaqaya: 'receipt.effect.baqaya',
      effectEmpty: 'receipt.effect.empty',
      recent: 'receipt.recent',
      recentLabel: 'receipt.recent.label',
      recentCounterparty: 'receipt.recent.counterparty',
    },
  };
}
