import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { en, TranslationKey } from './translations/en';
import { ur } from './translations/ur';

type Locale = 'en' | 'ur';
const LOCALE_KEY = 'hk.locale';
const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, ur };

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly _locale = signal<Locale>(
    (localStorage.getItem(LOCALE_KEY) as Locale | null) ?? 'en',
  );

  readonly locale = this._locale.asReadonly();
  readonly dir = computed<'rtl' | 'ltr'>(() => (this._locale() === 'ur' ? 'rtl' : 'ltr'));

  constructor() {
    effect(() => {
      const el = this.document.documentElement;
      el.lang = this._locale();
      el.dir = this.dir();
    });
  }

  setLocale(locale: Locale): void {
    localStorage.setItem(LOCALE_KEY, locale);
    this._locale.set(locale);
  }

  toggle(): void {
    this.setLocale(this._locale() === 'en' ? 'ur' : 'en');
  }

  t(key: TranslationKey, params?: Record<string, string>): string {
    let value = dictionaries[this._locale()][key];
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{{${k}}}`, v);
      }
    }
    return value;
  }

  formatNumber(n: number): string {
    // Wrap in a Unicode LTR isolate (U+2066…U+2069) so a negative sign isn't
    // flipped to the wrong side ("-15" → "15-") inside the RTL/Urdu layout.
    return '⁦' + n + '⁩';
  }

  /** A quantity with its unit, kept as one LTR run ("-30 kg", never "kg -30"). */
  qtyUnit(n: number, unit?: string | null): string {
    return '⁦' + n + (unit ? ' ' + unit : '') + '⁩';
  }

  /**
   * A rupee figure for display: thousands-grouped, e.g. `Rs 4,500`. Grouping is
   * what separates this from {@link formatNumber} — amounts are the star of
   * every ledger screen and read wrong without it (APPLICATION_DOMAIN §4).
   */
  money(n: number): string {
    return 'Rs ' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}
