import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { BeforeInstallPromptEvent, InstallService } from './install.service';

/**
 * The mode logic is the whole feature: pick the wrong one and the shopkeeper
 * either sees a dead button or no button at all. It is driven entirely by
 * browser state, so the window is faked rather than the service mocked.
 */
interface FakeWindow {
  __hkInstallPrompt?: BeforeInstallPromptEvent;
  standalone: boolean;
  displayMode: boolean;
  userAgent: string;
  maxTouchPoints: number;
  fire(type: string, event?: unknown): void;
}

function setup(overrides: Partial<FakeWindow> = {}): { service: InstallService; win: FakeWindow } {
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const win = {
    standalone: false,
    displayMode: false,
    userAgent: 'Mozilla/5.0 (Linux; Android 13)',
    maxTouchPoints: 0,
    ...overrides,
    addEventListener(type: string, fn: (e: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    matchMedia: () => ({ matches: win.displayMode }),
    get navigator() {
      return {
        standalone: win.standalone,
        userAgent: win.userAgent,
        maxTouchPoints: win.maxTouchPoints,
      };
    },
    fire(type: string, event: unknown = { preventDefault: () => undefined }) {
      listeners.get(type)?.forEach((fn) => fn(event));
    },
  } as unknown as FakeWindow;

  // Several cases build a second service to compare two browser states, so the
  // previous module has to be torn down before reconfiguring.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: { defaultView: win } }],
  });
  return { service: TestBed.inject(InstallService), win };
}

function fakePrompt(outcome: 'accepted' | 'dismissed'): BeforeInstallPromptEvent {
  return {
    preventDefault: () => undefined,
    prompt: () => Promise.resolve(),
    userChoice: Promise.resolve({ outcome }),
  } as unknown as BeforeInstallPromptEvent;
}

describe('InstallService', () => {
  it('offers instructions when no install event has arrived (iOS, Firefox)', () => {
    expect(setup().service.mode()).toBe('manual');
  });

  it('offers a one-tap install for an event stashed before Angular booted', () => {
    const { service } = setup({ __hkInstallPrompt: fakePrompt('accepted') });
    expect(service.mode()).toBe('prompt');
  });

  it('upgrades to a one-tap install when the event lands after boot', () => {
    const { service, win } = setup();
    expect(service.mode()).toBe('manual');
    win.fire('beforeinstallprompt', fakePrompt('accepted'));
    expect(service.mode()).toBe('prompt');
  });

  it('hides itself inside the installed app', () => {
    expect(setup({ displayMode: true }).service.mode()).toBe('hidden');
    // iOS never adopted display-mode; navigator.standalone is its stand-in.
    expect(setup({ standalone: true }).service.mode()).toBe('hidden');
  });

  it('hides itself once an install is accepted, without a reload', async () => {
    const { service } = setup({ __hkInstallPrompt: fakePrompt('accepted') });
    await service.install();
    expect(service.mode()).toBe('hidden');
  });

  it('stops offering a spent event when the install is dismissed', async () => {
    // Chrome rejects a second prompt() on the same event; the next visit
    // re-fires beforeinstallprompt, which restores the button.
    const { service } = setup({ __hkInstallPrompt: fakePrompt('dismissed') });
    await service.install();
    expect(service.mode()).toBe('manual');
  });

  it('retires the button when the install happened via the browser menu', () => {
    const { service, win } = setup({ __hkInstallPrompt: fakePrompt('accepted') });
    win.fire('appinstalled');
    expect(service.mode()).toBe('hidden');
  });

  it('picks the Safari wording only on iOS', () => {
    const ipadOs = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';
    expect(setup({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }).service.isIos).toBe(
      true,
    );
    // iPadOS 13+ lies and claims to be a Mac; touch points give it away.
    expect(setup({ userAgent: ipadOs, maxTouchPoints: 5 }).service.isIos).toBe(true);
    expect(setup({ userAgent: ipadOs, maxTouchPoints: 0 }).service.isIos).toBe(false);
    expect(setup().service.isIos).toBe(false);
  });
});
