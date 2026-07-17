import { Component } from '@angular/core';
import { PartyCashEntry, PartyCashEntryConfig } from './party-cash-entry';

/**
 * PAYMENT entry (ادائیگی / adaigi) — we pay down what we owe a party, so cash
 * leaves the drawer. The mirror of {@link Receipt}; see {@link PartyCashEntry}
 * for the shared surface.
 */
@Component({
  selector: 'app-payment',
  imports: [PartyCashEntry],
  template: `<app-party-cash-entry eventType="PAYMENT" [config]="config" />`,
})
export class Payment {
  protected readonly config: PartyCashEntryConfig = {
    idPrefix: 'payment',
    drawerFlow: 'out',
    labels: {
      newEntry: 'payment.newEntry',
      title: 'nav.payment',
      party: 'payment.party',
      partyPh: 'payment.party.ph',
      partyHint: 'payment.party.hint',
      partyUnknown: 'payment.party.unknown',
      amount: 'payment.amount',
      billNumber: 'payment.billNumber',
      billNumberPh: 'payment.billNumber.ph',
      description: 'payment.description',
      descriptionPh: 'payment.description.ph',
      clear: 'payment.clear',
      saveNext: 'payment.saveNext',
      effect: 'payment.effect',
      effectDrawer: 'payment.effect.drawer',
      effectBaqaya: 'payment.effect.baqaya',
      effectEmpty: 'payment.effect.empty',
      recent: 'payment.recent',
      recentLabel: 'payment.recent.label',
      recentCounterparty: 'payment.recent.counterparty',
    },
  };
}
