/**
 * A khata is ruled before anything is written in it. The next line is always already there,
 * and the pen never stops to draw one — which is exactly what an entry grid owes a shopkeeper
 * putting twenty designs on a bill with a customer waiting.
 *
 * {@link ruleLines} keeps that invariant over a list of line rows: exactly one unwritten line
 * sits at the foot, and writing on it rules the next. Nothing is ever added by hand, so Tab
 * out of the last rate lands on a real next row instead of a button that has to make one.
 */

/** The minimum a line row has to carry: a stable id, so @for keeps its DOM (and the caret). */
export interface Keyed {
  key: number;
}

/**
 * Returns `lines` with one ruled-but-unwritten line at the foot.
 *
 * `editing` names the line the caret is sitting in and is never trimmed: clearing the item
 * name on the last line must not pull the row out from under the person typing in it.
 *
 * Only *surplus* blanks are trimmed — two of them at the foot. The waiting line keeps its
 * object identity across every keystroke in the line above, which is what stops its row from
 * being torn down and rebuilt (and the caret from being dropped) on each character typed.
 */
export function ruleLines<T extends Keyed>(
  lines: readonly T[],
  written: (line: T) => boolean,
  blank: () => T,
  editing: number | null = null,
): T[] {
  const caret = editing == null ? -1 : lines.findIndex((l) => l.key === editing);

  let end = lines.length;
  while (end - 1 > caret && end >= 2 && !written(lines[end - 1]) && !written(lines[end - 2])) {
    end--;
  }

  const kept = lines.slice(0, end);
  const foot = kept[kept.length - 1];
  return foot && !written(foot) ? kept : [...kept, blank()];
}
