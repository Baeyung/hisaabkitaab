import { Directive } from '@angular/core';

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
  onInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const digits = toDigits(el.value);
    if (digits === el.value) {
      return;
    }

    // Pull the caret back by however many characters we removed ahead of it,
    // otherwise editing mid-number throws the cursor to the end.
    const pos = el.selectionStart ?? el.value.length;
    const caret = pos - (el.value.slice(0, pos).match(/\D/g)?.length ?? 0);

    el.value = digits;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Digits-only phone number: 7–15 digits, the E.164 ceiling. Shared by the
 *  signup form and mirrored by `@Pattern` on the backend. */
export const PHONE_PATTERN = /^\d{7,15}$/;
