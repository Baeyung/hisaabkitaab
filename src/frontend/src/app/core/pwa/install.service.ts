import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/**
 * The Chromium-only install event. Not in lib.dom, so it is typed here.
 * @see https://developer.mozilla.org/docs/Web/API/BeforeInstallPromptEvent
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    /** Set by the capture script in index.html. */
    __hkInstallPrompt?: BeforeInstallPromptEvent;
  }
}

/**
 * What the install control can offer right now.
 * - `prompt`  — Chromium: a real, one-tap install is available.
 * - `manual`  — iOS Safari / Firefox: no install API exists, only instructions.
 * - `hidden`  — already running as an installed app; nothing left to offer.
 */
export type InstallMode = 'prompt' | 'manual' | 'hidden';

/**
 * Owns "can this shop install the app, and how".
 *
 * Exists because the browser's own install hint is a mini-infobar that is
 * trivially dismissed and never seen again — shopkeepers were running the app
 * in a tab without knowing it could live on the home screen. The app therefore
 * needs its own durable, findable button, which needs somewhere to keep the
 * captured event.
 *
 * Three modes rather than a boolean because iOS is not "install unavailable",
 * it is "install available, but only the user can perform it": Safari fires no
 * beforeinstallprompt and exposes no API, so the only honest thing to show is
 * the Share → Add to Home Screen path.
 */
@Injectable({ providedIn: 'root' })
export class InstallService {
  private readonly window = inject(DOCUMENT).defaultView;

  // Seeded from the pre-bootstrap capture in index.html, then kept current —
  // on a first visit the event fires later, once the service worker activates.
  private readonly prompt = signal<BeforeInstallPromptEvent | null>(
    this.window?.__hkInstallPrompt ?? null,
  );
  private readonly installed = signal(this.isStandalone());

  readonly mode = computed<InstallMode>(() => {
    if (this.installed()) return 'hidden';
    return this.prompt() ? 'prompt' : 'manual';
  });

  /** Instruction wording differs by platform; only iOS needs its own phrasing. */
  readonly isIos = this.detectIos();

  constructor() {
    this.window?.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.prompt.set(e as BeforeInstallPromptEvent);
    });
    // Fires after an install completes by any route — including the browser's
    // own menu item — so the button retires itself without a reload.
    this.window?.addEventListener('appinstalled', () => {
      this.prompt.set(null);
      this.installed.set(true);
    });
  }

  /**
   * Shows the native install dialog. Resolves once the shopkeeper has chosen.
   * The captured event is single-use: Chrome rejects a second prompt() call on
   * the same event, so it is cleared either way. A dismissal re-fires
   * beforeinstallprompt on the next visit, which restores the button.
   */
  async install(): Promise<void> {
    const event = this.prompt();
    if (!event) return;
    this.prompt.set(null);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') this.installed.set(true);
    } catch {
      // Chrome rejects prompt() on an event it considers spent or gesture-less.
      // Nothing to recover: the event is already cleared, so the control falls
      // back to instructions until the next beforeinstallprompt.
    }
  }

  /**
   * iPadOS 13+ reports a desktop Mac user-agent, so the UA string alone sends
   * iPad users the wrong instructions. Touch points are what separates it from
   * a desktop Safari — which has no Add to Home Screen to point at anyway.
   */
  private detectIos(): boolean {
    const agent = this.window?.navigator;
    if (!agent) return false;
    return (
      /iphone|ipad|ipod/i.test(agent.userAgent) ||
      (/macintosh/i.test(agent.userAgent) && agent.maxTouchPoints > 1)
    );
  }

  /**
   * True when the app is already running installed. `display-mode` covers
   * Android and desktop; `navigator.standalone` is the iOS-only equivalent,
   * which Safari never replaced with the standard query.
   */
  private isStandalone(): boolean {
    if (!this.window) return false;
    return (
      this.window.matchMedia('(display-mode: standalone)').matches ||
      (this.window.navigator as { standalone?: boolean }).standalone === true
    );
  }
}
