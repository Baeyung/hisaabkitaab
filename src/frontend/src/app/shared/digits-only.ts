import { Directive, input } from '@angular/core';

/**
 * Keeps phone inputs to digits only — anything else is dropped as it is typed
 * or pasted, so "0300-123 4567" lands as "03001234567" instead of being
 * rejected outright. Auto-applies to every `input[type="tel"]`; components just
 * add it to `imports` and the markup stays as-is.
 *
 * The cleaned value is re-dispatched as a fresh `input` event rather than
 * written into the form directly: `[formField]` listens on that same event and
 * may already have taken the dirty value, and the order of the two host
 * listeners is not guaranteed. The second event carries digits only, so it
 * settles last — and stops the recursion on the equality check below.
 */
export function toDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

@Directive({
  selector: 'input[type="tel"]',
  host: { '(input)': 'onInput($event)' },
})
export class DigitsOnly {
  /** Hard cap on length, for fixed-width codes. `maxlength` can't do this job —
   *  it clashes with `[formField]`, which owns validation attributes. */
  readonly maxDigits = input<number>();

  /** Drops the trunk prefix as it is typed, for a field that already carries a
   *  country code beside it: with +92 picked, "03001234567" is the local
   *  3001234567, and keeping the 0 would build the wrong E.164 number. */
  readonly noLeadingZeros = input(false);

  private clean(raw: string): string {
    const digits = this.noLeadingZeros() ? toDigits(raw).replace(/^0+/, '') : toDigits(raw);
    return digits.slice(0, this.maxDigits());
  }

  onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const digits = this.clean(el.value);
    if (digits === el.value) {
      return;
    }

    // Where the caret lands is just how much text survives ahead of it — run the
    // same cleanup over that slice, otherwise editing mid-number throws the
    // cursor to the end.
    const pos = el.selectionStart ?? el.value.length;
    const caret = this.clean(el.value.slice(0, pos)).length;

    el.value = digits;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Digits-only phone number: 7–15 digits, the E.164 ceiling. Shared by the
 *  signup form and mirrored by `@Pattern` on the backend. */
export const PHONE_PATTERN = /^\d{7,15}$/;
