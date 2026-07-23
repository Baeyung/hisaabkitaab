import { DigitsOnly, PHONE_PATTERN } from './digits-only';

/** Runs the directive over a `tel` input holding `value`, caret at `caret`. */
function type(value: string, caret = value.length): { value: string; caret: number | null } {
  const el = document.createElement('input');
  el.type = 'tel';
  el.value = value;
  el.setSelectionRange(caret, caret);
  new DigitsOnly().onInput({ target: el } as unknown as Event);
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

  it('matches 7-15 digits and nothing else', () => {
    expect(PHONE_PATTERN.test('03001234567')).toBe(true);
    expect(PHONE_PATTERN.test('123456')).toBe(false);
    expect(PHONE_PATTERN.test('1234567890123456')).toBe(false);
    expect(PHONE_PATTERN.test('0300 123')).toBe(false);
  });
});
