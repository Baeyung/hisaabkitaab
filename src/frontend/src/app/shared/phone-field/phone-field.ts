import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { DigitsOnly, toDigits } from '../digits-only';

export interface Country {
  /** Dial code, digits only — prefixed onto the number as it is stored. */
  dial: string;
  flag: string;
  /** English only, on purpose: proper nouns, and the `title` is a hover aid,
   *  not label text. The option itself reads "🇵🇰 +92" in every locale. */
  name: string;
  /** A real subscriber number for this country, shown as the placeholder. */
  example: string;
}

/**
 * Where this app's users and their suppliers actually are — Pakistan, the Gulf
 * they work in, and the handful of countries they import from. Deliberately not
 * all ~240 dial codes: a short list fits a native `<select>` without a search
 * box, and an unlisted country is a one-line addition here.
 *
 * US and Canada share +1 and so share one row — two options with the same
 * `value` would make the select ambiguous about which is picked.
 */
export const COUNTRIES: readonly Country[] = [
  { dial: '92', flag: '🇵🇰', name: 'Pakistan', example: '3001234567' },
  { dial: '971', flag: '🇦🇪', name: 'United Arab Emirates', example: '501234567' },
  { dial: '966', flag: '🇸🇦', name: 'Saudi Arabia', example: '501234567' },
  { dial: '974', flag: '🇶🇦', name: 'Qatar', example: '33123456' },
  { dial: '968', flag: '🇴🇲', name: 'Oman', example: '92123456' },
  { dial: '965', flag: '🇰🇼', name: 'Kuwait', example: '51234567' },
  { dial: '973', flag: '🇧🇭', name: 'Bahrain', example: '36123456' },
  { dial: '44', flag: '🇬🇧', name: 'United Kingdom', example: '7400123456' },
  { dial: '1', flag: '🇺🇸', name: 'United States / Canada', example: '2015550123' },
  { dial: '61', flag: '🇦🇺', name: 'Australia', example: '412345678' },
  { dial: '91', flag: '🇮🇳', name: 'India', example: '9876543210' },
  { dial: '880', flag: '🇧🇩', name: 'Bangladesh', example: '1812345678' },
  { dial: '86', flag: '🇨🇳', name: 'China', example: '13123456789' },
  { dial: '60', flag: '🇲🇾', name: 'Malaysia', example: '123456789' },
];

export const DEFAULT_DIAL = '92';

/** Longest code first: +880 has to be tried before +88 would ever be, and +1
 *  must never shadow a longer code that happens to start with 1. */
const BY_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * The dial code a stored number opens with, or null if it opens with none —
 * which is how every number written before this field existed reads, since they
 * were saved bare ("03001234567"). Those fall back to the default country and
 * keep their digits intact until someone edits the row.
 */
export function dialOf(value: string): string | null {
  return BY_LENGTH.find((c) => value.startsWith(c.dial))?.dial ?? null;
}

/**
 * A typed subscriber number, reduced to what belongs after the dial code.
 * Handles the two ways users get it wrong: the habitual leading 0, and pasting
 * a whole number into the box that already has a country beside it.
 */
export function normalizeLocal(dial: string, raw: string): string {
  const digits = toDigits(raw).replace(/^0+/, '');
  // ponytail: prefix match, not a real parse — a local number that legitimately
  // starts with its own dial code and still leaves 7+ digits would be trimmed.
  // No such format in the list above; swap in libphonenumber if that changes.
  return digits.startsWith(dial) && digits.length - dial.length >= 7
    ? digits.slice(dial.length)
    : digits;
}

/**
 * Phone number entry — a country dropdown and a subscriber-number box that
 * together read and write one string.
 *
 * `value` is the number as stored: dial code and subscriber digits run together
 * with no `+` ("923001234567"). That is deliberate — it clears the backend's
 * `\d{7,15}` @Pattern untouched, so this control needed no server change, and it
 * is already the shape `wa.me/<number>` wants for WhatsApp.
 *
 * Blank in, blank out: an empty box stores `''`, never a bare dial code, so the
 * optional store and party contacts still save as "no number given".
 *
 * Implements `FormValueControl`, so `[formField]` binds it like a native input
 * and hands it `disabled` for free; the same `model()` also drives the plain
 * `[value]`/`(valueChange)` pair the store-setup wizard uses.
 */
@Component({
  selector: 'app-phone-field',
  imports: [DigitsOnly],
  template: `
    <div class="phone">
      <select
        class="fld__input phone__code"
        [value]="dial()"
        [disabled]="disabled()"
        [attr.aria-label]="locale.t('phone.country')"
        (change)="setDial($any($event.target).value)"
      >
        @for (c of countries; track c.dial) {
          <option [value]="c.dial" [title]="c.name">{{ c.flag }} +{{ c.dial }}</option>
        }
      </select>
      <input
        class="fld__input phone__num"
        type="tel"
        [attr.id]="inputId()"
        [noLeadingZeros]="true"
        inputmode="numeric"
        autocomplete="tel"
        [value]="local()"
        [disabled]="disabled()"
        [placeholder]="placeholder()"
        (input)="setLocal($any($event.target))"
      />
    </div>
  `,
  styles: `
    /* Always LTR: the country belongs to the left of the digits even in Urdu,
       and a phone number is never read right-to-left. */
    .phone {
      display: flex;
      gap: 8px;
      direction: ltr;
    }
    /* Mirrors select.rm-input from styles.css — the native arrow ignores padding,
       so it is replaced with the shared chevron to line up with the text. */
    .phone__code {
      flex: 0 0 auto;
      width: 116px;
      appearance: none;
      padding-inline-end: 30px;
      background-image: var(--kg-chevron);
      background-repeat: no-repeat;
      background-position: right 10px center;
      cursor: pointer;
    }
    .phone__code:focus {
      background-image: var(--kg-chevron-active);
    }
    .phone__num {
      flex: 1 1 auto;
      /* Without this a flex item refuses to shrink past its content, and the
         field overflows the narrow party edit row. */
      min-width: 0;
    }
  `,
})
export class PhoneField implements FormValueControl<string> {
  protected readonly locale = inject(LocaleService);
  protected readonly countries = COUNTRIES;

  readonly value = model.required<string>();
  readonly disabled = input(false);
  /** Put on the inner input so an outside `<label for>` still reaches it. */
  readonly inputId = input<string>();

  /**
   * Read off the value, but held rather than derived: clearing the box empties
   * the value, and a plain `computed` would snap the country back to the default
   * mid-edit. `linkedSignal` keeps the last pick when there is nothing to read.
   */
  protected readonly dial = linkedSignal<string, string>({
    source: this.value,
    computation: (value, prev) => dialOf(value) ?? prev?.value ?? DEFAULT_DIAL,
  });

  /** Everything after the dial code — or the whole thing, for a number saved
   *  before this field existed and so carrying no code at all. */
  protected readonly local = computed(() => {
    const value = this.value();
    const dial = this.dial();
    return value.startsWith(dial) ? value.slice(dial.length) : value;
  });

  protected readonly placeholder = computed(
    () => COUNTRIES.find((c) => c.dial === this.dial())?.example ?? '',
  );

  setDial(dial: string): void {
    // Read the local part against the *old* dial code before switching, or it
    // would be measured against a prefix the value does not have.
    const local = this.local();
    this.dial.set(dial);
    this.value.set(local ? dial + local : '');
  }

  setLocal(el: HTMLInputElement): void {
    const local = normalizeLocal(this.dial(), el.value);
    if (el.value !== local) {
      // Only a paste gets this far — DigitsOnly has already settled the typing
      // case, caret and all — and a paste leaves the caret at the end anyway.
      el.value = local;
    }
    this.value.set(local ? this.dial() + local : '');
  }
}
