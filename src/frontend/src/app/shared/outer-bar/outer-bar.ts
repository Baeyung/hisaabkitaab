import { Component, inject } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { BrandMark } from '../brand-mark/brand-mark';
import { LanguageToggle } from '../language-toggle/language-toggle';

/**
 * The frame for the screens that sit outside the app shell — the store picker and
 * the guided setup. Neither has a store chosen yet, so neither gets the shell's
 * nav, but both still need the brand, the language switch, and one trailing
 * control. That control is projected: "Log out" on the picker, "Leave setup" on
 * the wizard.
 */
@Component({
  selector: 'app-outer-bar',
  imports: [BrandMark, LanguageToggle],
  host: { class: 'bar' },
  template: `
    <div class="bar__brand">
      <span class="bar__logo"><app-brand-mark /></span>
      <b>{{ locale.t('app.name') }}</b>
    </div>
    <div class="bar__tools">
      <app-language-toggle />
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: 56px;
      padding-inline: 14px;
      background: var(--kg-chrome);
      color: var(--kg-chrome-ink);
    }
    .bar__brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .bar__brand b {
      font: 700 16px system-ui;
      white-space: nowrap;
    }
    .bar__logo {
      width: 32px;
      height: 32px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
      background: var(--kg-brand-solid);
      color: var(--kg-on-brand);
    }
    .bar__tools {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class OuterBar {
  protected readonly locale = inject(LocaleService);
}
