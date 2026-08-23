import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { DevTools } from './dev-tools';
import { DEV_TOOLS_KEY, DevToolsService } from '../../core/dev/dev-tools.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { PartyService } from '../../core/store/party.service';
import { StoreService } from '../../core/store/store.service';
import { Party } from '../../core/store/party.models';

const PARTIES = [
  { id: 'p2', name: 'Zubair Cloth' },
  { id: 'p1', name: 'Ali Traders' },
] as Party[];

/** The protected surface these tests drive — the panel's own controls. */
interface Internals {
  panel: { (): boolean; set(open: boolean): void };
  date: { set(iso: string): void };
  partyId: { set(id: string): void };
  error(): string | null;
  rendered(): { label: string; url: string }[];
  partyOptions(): { value: string; label: string }[];
  toggle(): Promise<void>;
  daily(): Promise<void>;
  reminder(): Promise<void>;
}

function setup(options: { fail?: unknown } = {}) {
  const asked: string[] = [];

  const answer = (what: string) =>
    options.fail ? Promise.reject(options.fail) : (asked.push(what), Promise.resolve(new Blob()));

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: DevToolsService,
        useValue: {
          enabled: signal(true),
          daily: (date: string) => answer(`daily ${date}`),
          reminder: (partyId: string, date: string) => answer(`reminder ${partyId} ${date}`),
        },
      },
      { provide: PartyService, useValue: { list: () => Promise.resolve(PARTIES) } },
      { provide: StoreService, useValue: { current: () => ({ name: 'Rahat Kirana' }) } },
      { provide: LocaleService, useValue: { t: (key: string) => key, locale: () => 'en' } },
    ],
  });

  // jsdom has neither: the blob URL is what the panel lists and the tab it tries to open is
  // the part a browser is entitled to refuse anyway.
  URL.createObjectURL = () => 'blob:rendered';
  URL.revokeObjectURL = () => {};
  window.open = () => null;

  const fixture = TestBed.createComponent(DevTools);
  return { fixture, panel: fixture.componentInstance as unknown as Internals, asked };
}

/**
 * A fake tab that remembers when it was asked for, so a test can tell "opened on the click"
 * from "opened once the PDF came back" — which is the whole of what a popup blocker cares
 * about, and is not otherwise visible from the outside.
 */
function withTabRecorder(renderStarted: () => boolean) {
  const opened: { whileRendering: boolean; href: string | null }[] = [];
  window.open = () => {
    const tab = {
      closed: false,
      document: { write: () => {}, close: () => {} },
      location: {
        set href(value: string) {
          opened[opened.length - 1].href = value;
        },
        get href() {
          return opened[opened.length - 1].href ?? '';
        },
      },
      close: () => {},
    };
    opened.push({ whileRendering: !renderStarted(), href: null });
    return tab as unknown as Window;
  };
  return opened;
}

describe('DevTools panel', () => {
  it('starts closed, with the gear as the only thing on screen', () => {
    const { fixture, panel } = setup();
    fixture.detectChanges();

    expect(panel.panel()).toBe(false);
    expect(fixture.nativeElement.querySelector('.dev-fab')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.dev-panel')).toBeNull();
  });

  it('loads the khata holders on first open, in name order', async () => {
    const { fixture, panel } = setup();
    await panel.toggle();
    await fixture.whenStable();

    expect(panel.partyOptions().map((option) => option.label)).toEqual([
      'Ali Traders',
      'Zubair Cloth',
    ]);
  });

  it('renders the daily report for the chosen date, not for today', async () => {
    const { fixture, panel, asked } = setup();
    await panel.toggle();
    panel.date.set('2026-08-14');
    await panel.daily();
    await fixture.whenStable();

    expect(asked).toEqual(['daily 2026-08-14']);
    // Every render stays listed: it is the way back to a PDF whose tab was blocked, and the
    // way to hold two of them side by side.
    expect(panel.rendered().map((item) => item.label)).toEqual(['Daily report · 2026-08-14']);
  });

  it('refuses a khata statement until a party is picked, then names them in the list', async () => {
    const { fixture, panel, asked } = setup();
    await panel.toggle();
    panel.date.set('2026-08-14');

    await panel.reminder();
    expect(asked).toEqual([]);

    panel.partyId.set('p1');
    await panel.reminder();
    await fixture.whenStable();

    expect(asked).toEqual(['reminder p1 2026-08-14']);
    expect(panel.rendered()[0].label).toBe('Khata · Ali Traders · 2026-08-14');
  });

  it('says what the server said, though the body arrived as a blob', async () => {
    const { panel } = setup({
      fail: new HttpErrorResponse({
        status: 404,
        error: new Blob([JSON.stringify({ message: 'Party not found' })]),
      }),
    });
    await panel.toggle();
    await panel.daily();

    // Asking for a blob means HttpClient does not parse the error body either; unhandled,
    // this panel would show "[object Blob]" for something the server had spelled out.
    expect(panel.error()).toBe('404: Party not found');
    expect(panel.rendered()).toEqual([]);
  });
});

describe('DevToolsService', () => {
  function enabledWith(value: string | null): boolean {
    TestBed.resetTestingModule();
    value === null ? localStorage.removeItem(DEV_TOOLS_KEY) : localStorage.setItem(DEV_TOOLS_KEY, value);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

    return TestBed.inject(DevToolsService).enabled();
  }

  it('shows the gear only for the exact flag', () => {
    expect(enabledWith('true')).toBe(true);
    // Nothing else counts — a leftover '1' or 'yes' from another app's key is not a request
    // for this one.
    expect(enabledWith('1')).toBe(false);
    expect(enabledWith(null)).toBe(false);
  });

  it('opens the tab on the click, not once the PDF has come back', async () => {
    let settled = false;
    let release: (blob: Blob) => void = () => {};
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: DevToolsService,
          useValue: {
            enabled: signal(true),
            daily: () =>
              new Promise<Blob>((resolve) => {
                release = (blob) => {
                  settled = true;
                  resolve(blob);
                };
              }),
            reminder: () => Promise.resolve(new Blob()),
          },
        },
        { provide: PartyService, useValue: { list: () => Promise.resolve(PARTIES) } },
        { provide: StoreService, useValue: { current: () => ({ name: 'Rahat Kirana' }) } },
        { provide: LocaleService, useValue: { t: (key: string) => key, locale: () => 'en' } },
      ],
    });
    URL.createObjectURL = () => 'blob:rendered';
    URL.revokeObjectURL = () => {};
    const opened = withTabRecorder(() => settled);

    const fixture = TestBed.createComponent(DevTools);
    const panel = fixture.componentInstance as unknown as Internals;
    const done = panel.daily();

    // The renderer has not answered yet, and the tab must already exist — after the await a
    // browser no longer treats it as the click's doing and refuses it.
    expect(opened.length).toBe(1);
    expect(opened[0].whileRendering).toBe(true);

    release(new Blob());
    await done;

    expect(opened.length).toBe(1); // the same tab, pointed at the PDF — not a second one
    expect(opened[0].href).toBe('blob:rendered');
  });
});
