import { Component, computed, inject, signal } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { InstallService } from '../../core/pwa/install.service';

/**
 * The explicit "put this on my home screen" control, in the sidebar foot beside
 * the theme and language toggles — all three are device preferences rather than
 * shop data, and this is the one place a shopkeeper already goes to change how
 * the app behaves on their phone.
 *
 * It exists because Chrome's own install hint is a mini-infobar that slides
 * away on the first scroll: users dismissed it without registering what it was
 * and had no way back to it. A button that stays put is the whole point, so it
 * renders in every state where installing is still possible — including iOS,
 * where it can only teach the Share → Add to Home Screen path because Safari
 * exposes no install API at all.
 *
 * Renders nothing once installed: inside the installed app the control would be
 * dead weight in a 200px-wide foot.
 */
@Component({
  selector: 'app-install-button',
  template: `
    @if (install.mode() !== 'hidden') {
      <div class="ib">
        <button
          type="button"
          class="ib__btn"
          [attr.aria-expanded]="manual() ? open() : null"
          [attr.aria-controls]="manual() ? 'install-steps' : null"
          (click)="activate()"
        >
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" aria-hidden="true"
          >
            <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
          </svg>
          {{ locale.t('install.button') }}
        </button>

        <!-- Steps belong to 'manual' only. Gated on the mode as well as the
             toggle so an open panel closes itself if beforeinstallprompt lands
             late and the button becomes a real one-tap install underneath it. -->
        @if (manual() && open()) {
          <p class="ib__steps" id="install-steps">{{ locale.t(stepsKey()) }}</p>
        }
      </div>
    }
  `,
  styles: `
    .ib {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    /* Matches .logout in shell.css so the sidebar foot reads as one group of controls,
       and mixed off currentColor so the same button also works on the board's paper foot. */
    .ib__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: var(--kg-control-h);
      /* Side padding, because in a row this button is only as wide as its own label —
         in the stacked sidebar foot it was stretched and never showed the lack. */
      padding: 0 14px;
      border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: 600 13px system-ui;
    }
    .ib__btn:hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .ib__steps {
      margin: 0;
      padding: 8px 10px;
      border-radius: 8px;
      background: color-mix(in srgb, currentColor 8%, transparent);
      color: color-mix(in srgb, currentColor 78%, transparent);
      font: 400 12px/1.5 system-ui;
    }
  `,
})
export class InstallButton {
  protected readonly locale = inject(LocaleService);
  protected readonly install = inject(InstallService);

  protected readonly open = signal(false);
  protected readonly manual = computed(() => this.install.mode() === 'manual');
  protected readonly stepsKey = computed(() =>
    this.install.isIos ? ('install.steps.ios' as const) : ('install.steps.other' as const),
  );

  protected activate(): void {
    if (this.install.mode() === 'prompt') {
      this.install.install();
    } else {
      this.open.update((v) => !v);
    }
  }
}
