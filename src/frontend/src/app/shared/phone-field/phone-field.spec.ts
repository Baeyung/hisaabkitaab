import { DEFAULT_DIAL, dialOf, normalizeLocal } from './phone-field';

describe('dialOf', () => {
  it('reads the dial code a stored number opens with', () => {
    expect(dialOf('923001234567')).toBe('92');
    expect(dialOf('971501234567')).toBe('971');
    expect(dialOf('12015550123')).toBe('1');
  });

  it('prefers the longest matching code', () => {
    // +880 must win over the +88 that a shorter-first scan would never reach,
    // and +86 must not swallow a Bangladeshi number.
    expect(dialOf('8801812345678')).toBe('880');
    expect(dialOf('8613123456789')).toBe('86');
  });

  it('finds nothing in a number saved before country codes existed', () => {
    // Every pre-existing row looks like this until it is backfilled; the field
    // falls back to the default country and leaves the digits alone.
    expect(dialOf('03001234567')).toBeNull();
    expect(dialOf('')).toBeNull();
  });
});

describe('normalizeLocal', () => {
  it('drops the habitual trunk zero', () => {
    expect(normalizeLocal('92', '03001234567')).toBe('3001234567');
    expect(normalizeLocal('92', '3001234567')).toBe('3001234567');
  });

  it('strips a dial code pasted into the subscriber box', () => {
    expect(normalizeLocal('92', '+92 300 1234567')).toBe('3001234567');
    expect(normalizeLocal('92', '923001234567')).toBe('3001234567');
  });

  it('leaves a short number that merely starts with the dial code', () => {
    // 6 digits left over is no subscriber number — this is someone mid-type,
    // not a paste, so the leading 92 is theirs to keep.
    expect(normalizeLocal('92', '92123456')).toBe('92123456');
  });

  it('keeps digits only', () => {
    expect(normalizeLocal('92', 'abc300-123 4567')).toBe('3001234567');
    expect(normalizeLocal('92', '')).toBe('');
  });
});

describe('stored form', () => {
  /** What the control writes: dial + local, or blank for an empty box. */
  const join = (dial: string, raw: string): string => {
    const local = normalizeLocal(dial, raw);
    return local ? dial + local : '';
  };

  it('runs the code and the number together, no +', () => {
    // The shape the backend's \d{7,15} @Pattern accepts, and the one wa.me wants.
    expect(join('92', '3001234567')).toBe('923001234567');
    expect(join(DEFAULT_DIAL, '0300 123 4567')).toBe('923001234567');
    expect(/^\d{7,15}$/.test(join('92', '3001234567'))).toBe(true);
  });

  it('stores blank for an empty box rather than a bare dial code', () => {
    // Store and party contacts are optional — "92" would be a phone number.
    expect(join('92', '')).toBe('');
    expect(join('971', '   ')).toBe('');
  });

  it('heals an un-backfilled number when the row is edited', () => {
    // Opening an old party row shows 03001234567 against the default +92;
    // saving it writes the number back in the new form.
    const stored = '03001234567';
    expect(dialOf(stored)).toBeNull();
    expect(join(DEFAULT_DIAL, stored)).toBe('923001234567');
  });
});
