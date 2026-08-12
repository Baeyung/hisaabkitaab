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
import { ShareRecipient, ShareResult, ShareTarget } from '../core/store/whatsapp.models';

const PARTY = {
  id: 'p1',
  name: 'Ali Traders',
  contact: PLACEHOLDER_CONTACT,
  address: 'Shah Alam Market',
} as Party;

const PEOPLE: ShareRecipient[] = [
  { userId: 'u1', name: 'Owner Sahib', role: 'OWNER' },
  { userId: 'u2', name: 'Bilal', role: 'EDITOR' },
];

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

/** The protected surface this spec drives — the picker, its field, and the send. */
interface Internals {
  typed: { set(value: string): void };
  hasNumber(): boolean;
  people(): ShareRecipient[];
  ask(): void;
  toggle(target: ShareTarget): void;
  send(event: Event): Promise<void>;
}

function setup(options: { updateFails?: boolean; result?: ShareResult } = {}) {
  const updates: PartyDraft[] = [];
  const sent: ShareTarget[][] = [];

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
            return options.updateFails ? Promise.reject(new Error('nope')) : Promise.resolve(PARTY);
          },
        },
      },
      {
        provide: WhatsAppService,
        useValue: {
          recipients: () => Promise.resolve(PEOPLE),
          share: (recipients: ShareTarget[]) => {
            sent.push(recipients);
            return Promise.resolve(
              options.result ?? { sent: recipients.length, failed: [] },
            );
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
  Object.assign(fixture.nativeElement.querySelector('dialog'), {
    showModal: () => {},
    close: () => {},
  });
  Object.defineProperty(document, 'adoptedStyleSheets', { value: [], configurable: true });
  return { fixture, button, updates, sent };
}

/**
 * Opens the picker and lets the recipient list arrive. The first settle matters: the inputs
 * are only bound once change detection has run, and the picker reads the party off them.
 */
async function open(fixture: { whenStable(): Promise<unknown> }, button: Internals) {
  await fixture.whenStable();
  button.ask();
  await fixture.whenStable();
}

describe('WhatsAppButton on a party with no real number', () => {
  it('asks for a number instead of going dead', async () => {
    const { fixture, button } = setup();
    await open(fixture, button);

    // The placeholder the backend stamps on a party created in passing is nobody's number.
    expect(button.hasNumber()).toBe(false);
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
  });

  it('saves the typed number on the party, keeping its other fields, then sends', async () => {
    const { fixture, button, updates, sent } = setup();
    await open(fixture, button);

    button.typed.set('923001234567');
    await button.send(new Event('click'));

    // The update replaces every field — losing the address here would be silent data loss.
    expect(updates).toEqual([
      { name: PARTY.name, contact: '923001234567', address: PARTY.address },
    ]);
    expect(sent).toEqual([[{ kind: 'PARTY', id: 'p1' }]]);
    expect(button.hasNumber()).toBe(true);
  });

  it('sends nothing when the number could not be saved', async () => {
    // The recipient is read off the party server-side, so a send after a failed save would
    // go to the placeholder — or nowhere — and still cost a message.
    const { fixture, button, sent } = setup({ updateFails: true });
    await open(fixture, button);

    button.typed.set('923001234567');
    await button.send(new Event('click'));

    expect(sent).toEqual([]);
    expect(button.hasNumber()).toBe(false);
  });
});

describe('WhatsAppButton recipient picker', () => {
  it('offers the shop’s own people alongside the party', async () => {
    const { fixture, button } = setup();
    await open(fixture, button);

    expect(button.people()).toEqual(PEOPLE);
    // The party this screen is about starts ticked — one press is still enough for it.
    expect(fixture.nativeElement.querySelectorAll('input[type="checkbox"]').length).toBe(3);
  });

  it('sends to everyone ticked in one go', async () => {
    const { fixture, button, sent } = setup();
    await open(fixture, button);

    button.typed.set('923001234567');
    button.toggle({ kind: 'USER', id: 'u2' });
    await button.send(new Event('click'));

    expect(sent).toEqual([
      [
        { kind: 'PARTY', id: 'p1' },
        { kind: 'USER', id: 'u2' },
      ],
    ]);
  });

  it('counts out a send that only reached some of them', async () => {
    const { fixture, button } = setup({ result: { sent: 1, failed: ['Bilal'] } });
    await open(fixture, button);

    button.typed.set('923001234567');
    button.toggle({ kind: 'USER', id: 'u2' });
    await button.send(new Event('click'));
    await fixture.whenStable();

    // Not "Sent" — the label says how many of them actually got it.
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('whatsapp.partial');
  });
});
