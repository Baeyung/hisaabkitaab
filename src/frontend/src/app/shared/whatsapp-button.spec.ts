import { Component, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WhatsAppButton } from './whatsapp-button';
import { LocaleService } from '../core/i18n/locale.service';
import { PlanService } from '../core/plan/plan.service';
import { PLACEHOLDER_CONTACT, Party, PartyDraft } from '../core/store/party.models';
import { PartyService } from '../core/store/party.service';
import { StoreService } from '../core/store/store.service';
import { WhatsAppService } from '../core/store/whatsapp.service';

const PARTY = {
  id: 'p1',
  name: 'Ali Traders',
  contact: PLACEHOLDER_CONTACT,
  address: 'Shah Alam Market',
} as Party;

@Component({
  imports: [WhatsAppButton],
  template: `
    <app-whatsapp-button
      [partyId]="'p1'"
      [partyName]="PARTY.name"
      [contact]="PARTY.contact"
      [document]="'Bill 1'"
      [action]="'Bill'"
    />
  `,
})
class Host {
  protected readonly PARTY = PARTY;
}

/** The protected surface this spec drives — the dialog's field and its send button. */
interface Internals {
  typed: { set(value: string): void };
  needsNumber(): boolean;
  send(event: Event): Promise<void>;
}

function setup(updateFails = false) {
  const updates: PartyDraft[] = [];
  const sent: string[] = [];

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: PartyService,
        useValue: {
          get: () => Promise.resolve({ ...PARTY }),
          update: (_id: string, draft: PartyDraft) => {
            updates.push(draft);
            return updateFails ? Promise.reject(new Error('nope')) : Promise.resolve(PARTY);
          },
        },
      },
      {
        provide: WhatsAppService,
        useValue: {
          send: (partyId: string) => {
            sent.push(partyId);
            return Promise.resolve();
          },
        },
      },
      {
        provide: PlanService,
        useValue: {
          whatsappAllowed: () => true,
          whatsappRemaining: () => 5,
          whatsappExhausted: () => false,
          refresh: () => Promise.resolve(),
        },
      },
      { provide: StoreService, useValue: { role: signal('OWNER') } },
      { provide: LocaleService, useValue: { t: (key: string) => key, locale: () => 'en' } },
    ],
  });

  const fixture = TestBed.createComponent(Host);
  const button = fixture.debugElement.query(By.directive(WhatsAppButton))
    .componentInstance as unknown as Internals;
  // Two gaps in the test DOM the send walks into: <dialog> arrives without its methods, and
  // adoptedStyleSheets without a length. Neither is what these tests are about.
  Object.assign(fixture.nativeElement.querySelector('dialog'), { close: () => {} });
  Object.defineProperty(document, 'adoptedStyleSheets', { value: [], configurable: true });
  return { fixture, button, updates, sent };
}

describe('WhatsAppButton on a party with no real number', () => {
  it('asks for a number instead of going dead', async () => {
    const { fixture, button } = setup();
    await fixture.whenStable();

    // The placeholder the backend stamps on a party created in passing is nobody's number.
    expect(button.needsNumber()).toBe(true);
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
  });

  it('saves the typed number on the party, keeping its other fields, then sends', async () => {
    const { fixture, button, updates, sent } = setup();
    await fixture.whenStable();

    button.typed.set('923001234567');
    await button.send(new Event('click'));

    // The update replaces every field — losing the address here would be silent data loss.
    expect(updates).toEqual([
      { name: PARTY.name, contact: '923001234567', address: PARTY.address },
    ]);
    expect(sent).toEqual(['p1']);
    expect(button.needsNumber()).toBe(false);
  });

  it('sends nothing when the number could not be saved', async () => {
    // The recipient is read off the party server-side, so a send after a failed save would
    // go to the placeholder — or nowhere — and still cost a message.
    const { fixture, button, sent } = setup(true);
    await fixture.whenStable();

    button.typed.set('923001234567');
    await button.send(new Event('click'));

    expect(sent).toEqual([]);
    expect(button.needsNumber()).toBe(true);
  });
});
