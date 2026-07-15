import { Component, inject } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';

@Component({
  selector: 'app-language-toggle',
  template: `
    <button type="button" class="lang-toggle" (click)="locale.toggle()">
      {{ locale.t('lang.toggle') }}
    </button>
  `,
  styles: `
    .lang-toggle {
      min-height: 44px;
      padding-inline: 1rem;
      background: transparent;
      border: 1px solid currentColor;
      border-radius: 0.5rem;
      cursor: pointer;
      font-size: 1rem;
    }
  `,
})
export class LanguageToggle {
  protected readonly locale = inject(LocaleService);
}
