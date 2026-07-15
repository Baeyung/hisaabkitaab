import { Component, inject, input } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';

@Component({
  selector: 'app-placeholder',
  template: `
    <div class="ph">
      <h1>{{ locale.t(titleKey()) }}</h1>
      <p>{{ locale.t('common.comingSoon') }}</p>
    </div>
  `,
  styles: `
    .ph {
      padding: 2rem;
    }
    h1 {
      margin: 0 0 0.4rem;
      font: 700 1.5rem system-ui;
      color: var(--kg-ink);
    }
    p {
      margin: 0;
      color: var(--kg-muted);
    }
  `,
})
export class Placeholder {
  protected readonly locale = inject(LocaleService);
  readonly titleKey = input.required<TranslationKey>();
}
