/**
 * The arithmetic behind a shop's own entry columns — `thans * gazana * rate`.
 *
 * A shunting-yard parse to RPN, then a walk over it. Deliberately not `new Function()` or
 * `eval`: a formula is typed by one shop's owner and then run in every other user's browser
 * on every keystroke of every bill, which makes it exactly the kind of string that must never
 * become code. What it can do is add, subtract, multiply, divide, group with brackets, and
 * name a column. That is the whole language.
 *
 * Parsing is separate from evaluation on purpose. The settings screen parses once, when the
 * owner saves, and refuses a formula it cannot read — so the entry grid, which evaluates on
 * every keystroke, only ever sees formulas that are already known to be good.
 */

/** A parsed formula, ready to evaluate. Opaque: build it with {@link parseFormula}. */
export interface Formula {
  /** The source text, kept so the settings screen can show back what was typed. */
  readonly source: string;
  /** The column ids this formula reads, for cycle detection and for the "used by" hints. */
  readonly refs: readonly string[];
  /** Reverse-Polish token stream — what {@link evaluate} walks. */
  readonly rpn: readonly Token[];
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; name: string }
  | { kind: 'op'; op: Operator };

type Operator = '+' | '-' | '*' | '/';

/** Thrown by {@link parseFormula}; carries a key the settings screen can translate. */
export class FormulaError extends Error {
  constructor(readonly key: FormulaErrorKey, readonly at?: string) {
    super(key);
  }
}

export type FormulaErrorKey =
  | 'unknownField'
  | 'unexpectedToken'
  | 'unbalancedBrackets'
  | 'incomplete'
  | 'empty';

const PRECEDENCE: Record<Operator, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

/**
 * A column id as the tokenizer will accept it: a letter or underscore, then letters, digits
 * or underscores. Kept deliberately narrower than what a label may contain, which is why ids
 * are slugged rather than being the label itself.
 */
const ID = /^[A-Za-z_][A-Za-z0-9_]*/;

const NUMBER = /^\d+(\.\d+)?/;

/**
 * Read a formula, or throw {@link FormulaError}.
 *
 * @param source what the owner typed.
 * @param known  the column ids that exist. A reference to anything else is the error worth
 *               catching early — it is what a renamed or deleted column leaves behind, and
 *               left alone it would silently evaluate to nothing on every bill.
 */
export function parseFormula(source: string, known: readonly string[]): Formula {
  const tokens = tokenize(source, known);
  if (tokens.length === 0) {
    throw new FormulaError('empty');
  }
  return {
    source,
    refs: [...new Set(tokens.filter((t) => t.kind === 'ref').map((t) => t.name))],
    rpn: toRpn(tokens),
  };
}

/**
 * Work a parsed formula out. Missing and non-finite inputs read as 0, and so does a division
 * by zero — a half-written line is the normal state of the grid, not an error to show: the
 * shopkeeper is still typing, and a row of red on an empty bill is noise. The amount column
 * simply stays at nothing until the numbers that feed it are there.
 */
export function evaluate(formula: Formula, values: Readonly<Record<string, number | null>>): number {
  const stack: number[] = [];
  for (const token of formula.rpn) {
    if (token.kind === 'num') {
      stack.push(token.value);
      continue;
    }
    if (token.kind === 'ref') {
      const v = values[token.name];
      stack.push(v == null || !Number.isFinite(v) ? 0 : v);
      continue;
    }
    const b = stack.pop() ?? 0;
    const a = stack.pop() ?? 0;
    stack.push(apply(token.op, a, b));
  }
  const result = stack.pop() ?? 0;
  return Number.isFinite(result) ? result : 0;
}

function apply(op: Operator, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    // A rate of "total / pieces" on a line with no pieces yet is mid-typing, not a mistake.
    case '/':
      return b === 0 ? 0 : a / b;
  }
}

/**
 * Which of `fields` cannot be worked out because their formulas depend on each other — a
 * column defined as `b + 1` where `b` is defined as `a * 2` and `a` as `b - 1`. Returns the
 * ids caught in a cycle, empty when the set is sound.
 *
 * Iterative rather than a depth-first walk with a colour map: at a dozen columns the cheap
 * version is to keep resolving whatever is resolvable until nothing more resolves, and
 * whatever is left is exactly the cycle.
 */
export function findCycles(fields: readonly { id: string; formula?: Formula | null }[]): string[] {
  const pending = new Map(fields.filter((f) => f.formula).map((f) => [f.id, f.formula!.refs]));
  const resolved = new Set(fields.filter((f) => !f.formula).map((f) => f.id));

  let progress = true;
  while (progress) {
    progress = false;
    for (const [id, refs] of pending) {
      if (refs.every((r) => resolved.has(r))) {
        resolved.add(id);
        pending.delete(id);
        progress = true;
      }
    }
  }
  return [...pending.keys()];
}

/**
 * The order to work the computed columns out in, so each one is evaluated after everything it
 * reads. Assumes {@link findCycles} has already passed; a cycle would simply leave the
 * unresolvable ids off the end, which evaluates them against zeroes rather than looping.
 */
export function evaluationOrder(
  fields: readonly { id: string; formula?: Formula | null }[],
): string[] {
  const order: string[] = [];
  const done = new Set(fields.filter((f) => !f.formula).map((f) => f.id));
  const pending = fields.filter((f) => f.formula);

  let progress = true;
  while (progress) {
    progress = false;
    for (const field of pending) {
      if (done.has(field.id)) {
        continue;
      }
      if (field.formula!.refs.every((r) => done.has(r))) {
        done.add(field.id);
        order.push(field.id);
        progress = true;
      }
    }
  }
  return order;
}

// ── parsing ───────────────────────────────────────────────────────────────

function tokenize(source: string, known: readonly string[]): (Token | { kind: 'paren'; p: '(' | ')' })[] {
  const out: (Token | { kind: 'paren'; p: '(' | ')' })[] = [];
  let rest = source.trim();

  while (rest.length > 0) {
    const char = rest[0];

    if (char === ' ') {
      rest = rest.slice(1);
      continue;
    }
    if (char === '(' || char === ')') {
      out.push({ kind: 'paren', p: char });
      rest = rest.slice(1);
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      out.push({ kind: 'op', op: char });
      rest = rest.slice(1);
      continue;
    }

    const num = NUMBER.exec(rest);
    if (num) {
      out.push({ kind: 'num', value: Number(num[0]) });
      rest = rest.slice(num[0].length);
      continue;
    }

    const id = ID.exec(rest);
    if (id) {
      if (!known.includes(id[0])) {
        throw new FormulaError('unknownField', id[0]);
      }
      out.push({ kind: 'ref', name: id[0] });
      rest = rest.slice(id[0].length);
      continue;
    }

    throw new FormulaError('unexpectedToken', char);
  }

  return out;
}

/** Shunting-yard. Every operator here is left-associative, so no associativity table. */
function toRpn(tokens: (Token | { kind: 'paren'; p: '(' | ')' })[]): Token[] {
  const out: Token[] = [];
  const ops: ({ kind: 'op'; op: Operator } | { kind: 'paren'; p: '(' })[] = [];

  for (const token of tokens) {
    if (token.kind === 'num' || token.kind === 'ref') {
      out.push(token);
      continue;
    }
    if (token.kind === 'op') {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.kind !== 'op' || PRECEDENCE[top.op] < PRECEDENCE[token.op]) {
          break;
        }
        out.push(ops.pop() as { kind: 'op'; op: Operator });
      }
      ops.push(token);
      continue;
    }
    if (token.p === '(') {
      ops.push({ kind: 'paren', p: '(' });
      continue;
    }
    // ')' — unwind to the matching '('.
    let matched = false;
    while (ops.length > 0) {
      const top = ops.pop()!;
      if (top.kind === 'paren') {
        matched = true;
        break;
      }
      out.push(top);
    }
    if (!matched) {
      throw new FormulaError('unbalancedBrackets');
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.kind === 'paren') {
      throw new FormulaError('unbalancedBrackets');
    }
    out.push(top);
  }

  checkArity(out);
  return out;
}

/**
 * That the token stream actually forms an expression — `thans *` and `thans gazana` both
 * tokenize happily and would otherwise evaluate to something arbitrary. Counting the stack
 * depth an RPN walk would reach is the whole check.
 */
function checkArity(rpn: Token[]): void {
  let depth = 0;
  for (const token of rpn) {
    if (token.kind === 'op') {
      depth -= 1;
      if (depth < 1) {
        throw new FormulaError('incomplete');
      }
    } else {
      depth += 1;
    }
  }
  if (depth !== 1) {
    throw new FormulaError('incomplete');
  }
}
