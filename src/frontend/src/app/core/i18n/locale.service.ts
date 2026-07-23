import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { en, TranslationKey } from './translations/en';
import { ur } from './translations/ur';
import { TransactionEventKind } from '../store/cashbook.models';

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

  /**
   * Label for an entry the shopkeeper saved without a note. The backend stores
   * no description in that case, so the row is worded here and re-words itself
   * when the language is toggled. Item names and the party come from the row;
   * whichever the event has no wording for is dropped ("Sold Lawn Print × 12 to
   * Rana" → "Sold Lawn Print × 12" → "Sold to Rana" → "Sale").
   */
  describe(
    event: TransactionEventKind,
    party?: string | null,
    amount?: number | null,
    items?: string | null,
  ): string {
    const key = [
      items && party ? `auto.${event}.items.party` : null,
      items ? `auto.${event}.items` : null,
      party ? `auto.${event}.party` : null,
      `auto.${event}`,
    ].find((k): k is TranslationKey => !!k && k in en)!;
    return this.t(key, {
      party: party ?? '',
      amount: this.money(amount ?? 0),
      items: items ?? '',
    });
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
