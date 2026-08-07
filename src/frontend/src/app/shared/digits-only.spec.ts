import { TestBed } from '@angular/core/testing';
import { DigitsOnly, PHONE_PATTERN } from './digits-only';

/** Runs the directive over a `tel` input holding `value`, caret at `caret`.
 *  Constructed in an injection context — `maxDigits` is an `input()`. */
function type(
  value: string,
  caret = value.length,
  noLeadingZeros = false,
): { value: string; caret: number | null } {
  const el = document.createElement('input');
  el.type = 'tel';
  el.value = value;
  el.setSelectionRange(caret, caret);
  const directive = TestBed.runInInjectionContext(() => new DigitsOnly());
  // An `input()` signal has no setter; stub it with a plain reader instead.
  Object.defineProperty(directive, 'noLeadingZeros', { value: () => noLeadingZeros });
  directive.onInput({ target: el } as unknown as Event);
  return { value: el.value, caret: el.selectionStart };
}

describe('DigitsOnly', () => {
  it('drops letters and punctuation, keeps digits', () => {
    expect(type('abc123').value).toBe('123');
    expect(type('+92 300-123 4567').value).toBe('923001234567');
    expect(type('03001234567').value).toBe('03001234567');
  });

  it('holds the caret across the characters it removed', () => {
    // "03-00|1" → the dash before the caret goes, so the caret slides back one.
    expect(type('03-001', 5).caret).toBe(4);
  });

  it('drops leading zeros only when asked, and keeps the caret with them', () => {
    // Beside a country dropdown the trunk 0 is wrong; on its own it is the number.
    expect(type('03001234567', 11, true).value).toBe('3001234567');
    expect(type('03001234567').value).toBe('03001234567');
    // "0300|" → the 0 in front of the caret goes, so the caret slides back one.
    expect(type('0300', 4, true).caret).toBe(3);
  });

  it('matches 7-15 digits and nothing else', () => {
    expect(PHONE_PATTERN.test('03001234567')).toBe(true);
    expect(PHONE_PATTERN.test('123456')).toBe(false);
    expect(PHONE_PATTERN.test('1234567890123456')).toBe(false);
    expect(PHONE_PATTERN.test('0300 123')).toBe(false);
  });
});
