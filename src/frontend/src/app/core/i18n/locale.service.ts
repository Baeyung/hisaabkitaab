import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { en, TranslationKey } from './translations/en';
import { ur } from './translations/ur';
import { TransactionEventKind } from '../store/cashbook.models';

export type Locale = 'en' | 'ur';
const LOCALE_KEY = 'hk.locale';
const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, ur };
/** Every language the app speaks, for the switcher to lay out. Order is the reading order. */
const LOCALES: readonly Locale[] = ['en', 'ur'];

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly _locale = signal<Locale>(
    (localStorage.getItem(LOCALE_KEY) as Locale | null) ?? 'en',
  );

  readonly locale = this._locale.asReadonly();
  readonly dir = computed<'rtl' | 'ltr'>(() => (this._locale() === 'ur' ? 'rtl' : 'ltr'));
  /** Mirrors ThemeService.options — what the switcher in the sidebar foot renders. */
  readonly options = LOCALES;

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

  /**
   * What a menu entry is called. The shop's own name wins — one string for both languages,
   * because a shop's word for something is its own word whichever language the app is in —
   * and the built-in wording stands in when it never set one.
   *
   * Not just `item.label || t(item.key)`, because a group a shop made for itself has no
   * built-in wording to fall back to: its key is an id (`grp:k3x1`), not a translation key.
   * `mergeMenu` already refuses to build an unnamed one, so the empty string here is the
   * belt to that document-level brace rather than something the sidebar is expected to draw.
   */
  navLabel(item: { key: string; label?: string }): string {
    return item.label || dictionaries[this._locale()][item.key as TranslationKey] || '';
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
   * The label every entry row carries. It is worded here, not stored, so it
   * re-words itself when the language is toggled; the shopkeeper's own note
   * (when there is one) trails it in brackets rather than replacing it.
   * Item names and the party come from the row;
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

  /**
   * An ISO date (`yyyy-MM-dd`) or timestamp, as `DD/MM/YYYY` — the one date
   * format every screen shows. A bare `yyyy-MM-dd` is read directly off the
   * string rather than through `Date`, which parses it as UTC midnight and
   * can roll it back a day west of Pakistan (matches `date.util.ts`'s
   * local-day rule); a full timestamp still goes through `Date` so the local
   * calendar day comes out right.
   */
  date(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (m) {
      return `${m[3]}/${m[2]}/${m[1]}`;
    }
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
}
