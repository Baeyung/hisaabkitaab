import { Component, computed, inject } from '@angular/core';
import { LocaleService } from '../../../core/i18n/locale.service';
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';

interface KhataRow {
  en: string;
  ur: string;
  amount: number;
  dir: 'in' | 'out';
}

/**
 * Two-pane frame shared by the login and signup screens. The left pane is
 * the "living khata" hero — a sample party-balances ledger that previews the
 * real product artifact (baqaya in green = they owe you, red = you owe them).
 * The right pane holds the brand mark, language toggle, and the projected
 * form. Folds to a single centered column on narrow screens.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [LanguageToggle],
  template: `
    <div class="auth">
      <div class="auth__stage">
        <aside class="auth__hero">
          <div class="auth__brandline">
            <div class="auth__mark" aria-hidden="true">{{ mark() }}</div>
            <div>
              <div class="auth__wordmark">{{ locale.t('app.name') }}</div>
              <div class="auth__tagline">{{ locale.t('auth.brand.tagline') }}</div>
            </div>
          </div>

          <div class="auth__pitch">
            <h2>{{ locale.t('auth.hero.heading') }}</h2>
            <p>{{ locale.t('auth.hero.sub') }}</p>
          </div>

          <div class="kh" role="img" [attr.aria-label]="locale.t('auth.hero.title')">
            <div class="kh__cap">
              <b>{{ locale.t('auth.hero.title') }}</b>
              <span>{{ locale.t('auth.hero.today') }}</span>
            </div>
            @for (row of rows; track row.en) {
              <div class="kh__row">
                <div class="kh__party">
                  <span class="kh__name">{{ locale.locale() === 'ur' ? row.ur : row.en }}</span>
                  <span class="kh__dir">{{
                    locale.t(row.dir === 'in' ? 'auth.hero.theyOwe' : 'auth.hero.youOwe')
                  }}</span>
                </div>
                <span
                  class="kh__amt num"
                  [class.kh__amt--in]="row.dir === 'in'"
                  [class.kh__amt--out]="row.dir === 'out'"
                  >{{ money(row.amount) }}</span
                >
              </div>
            }
          </div>
        </aside>

        <section class="auth__panel">
          <div class="auth__toggle"><app-language-toggle /></div>

          <div class="auth__brand--mobile">
            <div class="auth__mark" aria-hidden="true">{{ mark() }}</div>
            <div>
              <div class="auth__wordmark">{{ locale.t('app.name') }}</div>
              <div class="auth__tagline">{{ locale.t('auth.brand.tagline') }}</div>
            </div>
          </div>

          <ng-content />
        </section>
      </div>
    </div>
  `,
})
export class AuthShell {
  protected readonly locale = inject(LocaleService);

  /** First letter of the localized app name, set inside the brand mark. */
  protected readonly mark = computed(() => this.locale.t('app.name').trim().charAt(0));

  protected readonly rows: KhataRow[] = [
    { en: 'Rana Cloth House', ur: 'رانا کلاتھ ہاؤس', amount: 82000, dir: 'in' },
    { en: 'Crescent Textiles', ur: 'کریسنٹ ٹیکسٹائل', amount: 46500, dir: 'out' },
    { en: 'Bilal & Sons', ur: 'بلال اینڈ سنز', amount: 23400, dir: 'in' },
  ];

  /** Grouped rupee figure. */
  protected money(n: number): string {
    return 'Rs ' + n.toLocaleString('en-US');
  }
}
