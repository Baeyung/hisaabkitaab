import {
  Formula,
  FormulaError,
  evaluate,
  evaluationOrder,
  findCycles,
  parseFormula,
} from './formula';

/** The worked example from the brief: a shop that counts cloth in thans of so many gaz. */
const FIELDS = ['thans', 'gazana', 'rate', 'qty'];

const parse = (source: string) => parseFormula(source, FIELDS);

/** The error key a parse threw, or null if it did not throw. */
function errorKey(source: string, known: readonly string[] = FIELDS): string | null {
  try {
    parseFormula(source, known);
    return null;
  } catch (e) {
    return e instanceof FormulaError ? e.key : 'not-a-formula-error';
  }
}

describe('parseFormula', () => {
  it('reads the columns a formula names', () => {
    expect(parse('thans * gazana * rate').refs).toEqual(['thans', 'gazana', 'rate']);
  });

  it('names each column once however often it is used', () => {
    expect(parse('qty * rate + qty').refs).toEqual(['qty', 'rate']);
  });

  it('keeps the source, so the settings screen shows back what was typed', () => {
    expect(parse('thans  *  gazana').source).toBe('thans  *  gazana');
  });

  it('refuses a column that does not exist — what a rename or a delete leaves behind', () => {
    expect(errorKey('thans * pieces')).toBe('unknownField');
  });

  it('refuses an unfinished expression rather than guessing at it', () => {
    expect(errorKey('thans *')).toBe('incomplete');
    expect(errorKey('* thans')).toBe('incomplete');
    expect(errorKey('thans gazana')).toBe('incomplete');
  });

  it('refuses unbalanced brackets from either side', () => {
    expect(errorKey('(thans * gazana')).toBe('unbalancedBrackets');
    expect(errorKey('thans * gazana)')).toBe('unbalancedBrackets');
  });

  it('refuses a character that is not part of the language', () => {
    expect(errorKey('thans ^ gazana')).toBe('unexpectedToken');
    expect(errorKey('thans; drop table')).toBe('unexpectedToken');
  });

  it('refuses an empty formula', () => {
    expect(errorKey('   ')).toBe('empty');
  });

  // The hints and the "cannot be read" message both print × ÷ −, and a phone keyboard offers
  // them: what the screen tells a shopkeeper to type has to be what the parser reads.
  it('reads × ÷ − as the operators the screen prints', () => {
    expect(errorKey('thans × gazana ÷ rate − 1')).toBeNull();
    expect(evaluate(parse('thans × gazana'), { thans: 4, gazana: 16 })).toBe(64);
  });
});

describe('evaluate', () => {
  const values = { thans: 3, gazana: 21, rate: 100, qty: 5 };

  it('works out the brief’s example', () => {
    expect(evaluate(parse('thans * gazana * rate'), values)).toBe(6300);
  });

  it('honours precedence, so a + b * c is not (a + b) * c', () => {
    expect(evaluate(parse('thans + gazana * rate'), values)).toBe(2103);
  });

  it('honours brackets over precedence', () => {
    expect(evaluate(parse('(thans + gazana) * rate'), values)).toBe(2400);
  });

  it('subtracts and divides left to right', () => {
    expect(evaluate(parse('gazana - thans - qty'), values)).toBe(13);
    expect(evaluate(parse('rate / qty / thans'), values)).toBeCloseTo(6.6667, 3);
  });

  it('takes a constant, so a formula can knock off a percentage', () => {
    expect(evaluate(parse('qty * rate * 0.9'), values)).toBe(450);
  });

  it('reads a half-written line as nothing rather than as an error', () => {
    // The normal state of the grid: the shopkeeper is still typing.
    expect(evaluate(parse('thans * gazana * rate'), { thans: 3, gazana: null, rate: null })).toBe(0);
    expect(evaluate(parse('thans * gazana'), {})).toBe(0);
  });

  it('reads a division by nothing as nothing, for the same reason', () => {
    expect(evaluate(parse('rate / qty'), { rate: 100, qty: 0 })).toBe(0);
    expect(evaluate(parse('rate / qty'), { rate: 100, qty: null })).toBe(0);
  });

  it('never returns a NaN or an infinity to the money column', () => {
    expect(evaluate(parse('rate * qty'), { rate: Number.NaN, qty: 2 })).toBe(0);
    expect(evaluate(parse('rate * qty'), { rate: Number.POSITIVE_INFINITY, qty: 2 })).toBe(0);
  });

  it('reproduces the default grid exactly, which is what every existing shop gets', () => {
    expect(evaluate(parseFormula('qty * rate', ['qty', 'rate']), { qty: 5, rate: 2100 })).toBe(10500);
  });
});

describe('findCycles', () => {
  const field = (id: string, source?: string) => ({
    id,
    formula: source ? (parseFormula(source, ['a', 'b', 'c', ...FIELDS]) as Formula) : null,
  });

  it('passes a sound set', () => {
    expect(findCycles([field('thans'), field('gazana'), field('a', 'thans * gazana')])).toEqual([]);
  });

  it('catches a column defined in terms of itself', () => {
    expect(findCycles([field('a', 'a + 1')])).toEqual(['a']);
  });

  it('catches a cycle running through other columns', () => {
    const cycle = findCycles([field('a', 'b + 1'), field('b', 'c + 1'), field('c', 'a + 1')]);
    expect(cycle.sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not mistake a long chain for a cycle', () => {
    expect(findCycles([field('thans'), field('a', 'thans + 1'), field('b', 'a + 1'), field('c', 'b + 1')]))
      .toEqual([]);
  });
});

describe('evaluationOrder', () => {
  const field = (id: string, source?: string) => ({
    id,
    formula: source ? (parseFormula(source, ['a', 'b', ...FIELDS]) as Formula) : null,
  });

  it('puts a computed column after everything it reads', () => {
    // `b` reads `a`, which reads the typed columns — so `a` has to be worked out first.
    // Every referenced column is listed: parseFormula refuses a formula naming one that
    // is not, so a set reaching here can never reference something absent.
    const fields = [
      field('b', 'a * rate'),
      field('a', 'thans * gazana'),
      field('thans'),
      field('gazana'),
      field('rate'),
    ];
    expect(evaluationOrder(fields)).toEqual(['a', 'b']);
  });

  it('leaves the typed columns out — there is nothing to work out', () => {
    expect(evaluationOrder([field('thans'), field('gazana')])).toEqual([]);
  });
});
