import { PASSWORD_PATTERN, PASSWORD_RULES } from './password-field';

const missing = (value: string) => PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.key);

describe('PASSWORD_RULES', () => {
  it('names the part that is missing', () => {
    expect(missing('abcdefgh')).toEqual(['validation.password.digit', 'validation.password.special']);
    expect(missing('abcdefg1')).toEqual(['validation.password.special']);
    expect(missing('abcdefg!')).toEqual(['validation.password.digit']);
    expect(missing('abc1!')).toEqual(['validation.password.length']);
    expect(missing('abcdefg1!')).toEqual([]);
  });
});

describe('PASSWORD_PATTERN', () => {
  // The checklist and the form validator are written separately, so anything that
  // satisfies all three rules has to clear the regex, and nothing else may.
  it('agrees with the checklist', () => {
    const samples = [
      '',
      'a',
      'abcdefgh',
      'abcdefg1',
      'abcdefg!',
      'abc1!',
      'abcdefg1!',
      'Passw0rd!',
      '12345678!',
      '        1!',
      'اردو1!پاسورڈ',
    ];
    for (const s of samples) {
      expect(PASSWORD_PATTERN.test(s), `for "${s}"`).toBe(missing(s).length === 0);
    }
  });
});
