import { ruleLines } from './ruled-lines';

/**
 * The invariant the entry grids are built on: there is always a line waiting, and it is
 * always the *same* waiting line until someone writes on it. The identity half matters as
 * much as the count — a waiting line replaced on every keystroke is a DOM row torn down and
 * rebuilt under the caret, which is the bug this file exists to keep out.
 */

interface Row {
  key: number;
  name: string;
}

let seq = 0;
const blank = (): Row => ({ key: ++seq, name: '' });
const written = (r: Row) => r.name.trim().length > 0;
const rule = (rows: Row[], editing: number | null = null) =>
  ruleLines(rows, written, blank, editing);

const row = (key: number, name: string): Row => ({ key, name });

describe('ruleLines', () => {
  it('rules a line into an empty grid', () => {
    const out = rule([]);
    expect(out.length).toBe(1);
    expect(written(out[0])).toBe(false);
  });

  it('rules the next line as soon as the foot is written on', () => {
    const out = rule([row(1, 'Lawn print')], 1);
    expect(out.length).toBe(2);
    expect(out[0].name).toBe('Lawn print');
    expect(written(out[1])).toBe(false);
  });

  it('leaves a grid that already has its waiting line alone', () => {
    const rows = [row(1, 'Lawn print'), row(2, '')];
    expect(rule(rows, 1)).toEqual(rows);
  });

  it('keeps the waiting line the same object while the line above is typed in', () => {
    let rows = [row(1, 'L'), row(2, '')];
    const waiting = rows[1];
    for (const name of ['La', 'Law', 'Lawn']) {
      rows = rule([{ ...rows[0], name }, ...rows.slice(1)], 1);
    }
    expect(rows.length).toBe(2);
    // Same key, same object — the row is never remounted, so the caret is never dropped.
    expect(rows[1]).toBe(waiting);
  });

  it('never leaves two waiting lines at the foot', () => {
    const out = rule([row(1, 'Lawn print'), row(2, ''), row(3, '')]);
    expect(out.length).toBe(2);
    expect(out[0].name).toBe('Lawn print');
  });

  it('does not pull the line being cleared out from under the caret', () => {
    // The last written line has just been emptied; it is where the caret is.
    const out = rule([row(1, 'Lawn print'), row(2, ''), row(3, '')], 2);
    expect(out.map((r) => r.key)).toEqual([1, 2]);
  });

  it('rules a fresh line when the last written one is removed', () => {
    const out = rule([row(2, '')]);
    expect(out.map((r) => r.key)).toEqual([2]);
  });

  it('keeps written lines in order and only ever touches the foot', () => {
    const out = rule([row(1, 'a'), row(2, ''), row(3, 'c')], 3);
    // A blank in the middle is the shopkeeper's business, not the grid's.
    expect(out.slice(0, 3).map((r) => r.name)).toEqual(['a', '', 'c']);
    expect(out.length).toBe(4);
  });
});
