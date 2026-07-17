import { signal } from '@angular/core';

/** A just-saved entry, kept in-session for the "Just entered" rail. */
export interface RecentEntry {
  key: number;
  summary: string;
  sub: string;
}

/** Beyond a handful the rail stops being a glance and starts being a list. */
const MAX_ENTRIES = 6;

/**
 * The in-session "Just entered" rail shared by the entry screens. Newest first,
 * capped at {@link MAX_ENTRIES}, and deliberately not persisted — it exists so a
 * batch user can see the last few entries land and catch a mistake in the
 * rhythm, not as a history (the cashbook is the record).
 *
 * Plain class, not a service: each screen owns its own rail, and the entries die
 * with the component.
 */
export class RecentLog {
  private readonly _entries = signal<RecentEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  /** Stable ids for `@for` tracking; per-instance, so it never collides. */
  private keySeq = 1;

  push(summary: string, sub: string): void {
    this._entries.update((rs) =>
      [{ key: this.keySeq++, summary, sub }, ...rs].slice(0, MAX_ENTRIES),
    );
  }
}
