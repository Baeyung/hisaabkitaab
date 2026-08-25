import { invertDirection, invertInOut } from './balance.util';

describe('invertDirection', () => {
  it('flips owing to the other side of the counter', () => {
    expect(invertDirection('THEY_OWE_YOU')).toBe('YOU_OWE_THEM');
    expect(invertDirection('YOU_OWE_THEM')).toBe('THEY_OWE_YOU');
  });

  it('leaves a settled balance alone', () => {
    expect(invertDirection('SETTLED')).toBe('SETTLED');
  });
});

describe('invertInOut', () => {
  it('flips IN/OUT and leaves NONE alone', () => {
    expect(invertInOut('IN')).toBe('OUT');
    expect(invertInOut('OUT')).toBe('IN');
    expect(invertInOut('NONE')).toBe('NONE');
  });
});
