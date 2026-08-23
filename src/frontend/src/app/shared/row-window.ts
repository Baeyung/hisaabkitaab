import {
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  Signal,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CaptureModeService } from './capture-mode.service';

/**
 * How many rows a list may have before it is worth windowing. Below this a table costs
 * a few milliseconds to render whole, and windowing it would only add a scroll listener
 * and a pair of spacer rows to something nobody was waiting on. Above it the cost is the
 * screen: a party's khata runs to eleven thousand rows in a real shop, and rendering
 * those took a second and a half of DOM building before anything could be read.
 */
const WINDOW_ABOVE = 150;

/** Rows rendered beyond each edge of the viewport, so a flick of the wheel lands on rows that exist. */
const OVERSCAN = 12;

/** Starting guess for a row's height, replaced by a measured one after the first render. */
const ASSUMED_ROW_PX = 44;

export interface RowWindow<T> {
  /** The slice to render — every row while capturing, or under the threshold. */
  readonly rows: Signal<T[]>;
  /** Height of the spacer above the slice, in px; 0 when not windowing. */
  readonly padTop: Signal<number>;
  /** Height of the spacer below the slice, in px; 0 when not windowing. */
  readonly padBottom: Signal<number>;
  /** Whether rows are actually being withheld — drives the spacer rows in the template. */
  readonly windowing: Signal<boolean>;
  /** @internal Written by {@link RowWindowDirective}. */
  readonly _viewport: ReturnType<typeof signal<{ top: number; height: number }>>;
  /** @internal Written by {@link RowWindowDirective} from what it measured. */
  readonly _rowPx: ReturnType<typeof signal<number>>;
}

/**
 * Render only the rows near the viewport, out of a list that may be arbitrarily long.
 *
 * Call it in a field initialiser with the signal the table iterates —
 * `protected readonly win = rowWindow(this.filteredRows)` — then iterate `win.rows()`
 * instead, and put `[appRowWindow]="win"` on the `<tbody>`. The directive measures; this
 * holds the arithmetic.
 *
 * Heights are measured rather than assumed because they genuinely vary here: the same
 * table is rows on a desktop and stacked cards on a phone (see the `data-label` rules in
 * styles.css), and print expands documents into sub-rows beneath their row. A running
 * average of what was actually rendered keeps the spacers close enough that the scrollbar
 * behaves, and self-corrects as the user scrolls into taller rows.
 */
export interface RowWindowOptions {
  /**
   * Render the whole list for as long as this is true, on top of the usual reasons.
   *
   * For the settings tables, which edit in place: an open editor is a real `<tr>` holding
   * what the shopkeeper has typed, and a window that scrolled it out would destroy the row
   * and the half-finished input with it. Editing one row out of two thousand is brief and
   * deliberate, so the table simply stops windowing until the editor closes — the cost is a
   * slower moment on a keystroke nobody is waiting on, against losing what they typed.
   */
  readonly suspendWhile?: () => boolean;
}

export function rowWindow<T>(
  source: Signal<readonly T[]>,
  options: RowWindowOptions = {},
): RowWindow<T> {
  const capture = inject(CaptureModeService);
  const viewport = signal({ top: 0, height: 0 });
  const rowPx = signal(ASSUMED_ROW_PX);

  // Whole list when the page is being copied, while a row is being edited, and when there
  // is not enough of it to bother.
  const windowing = computed(
    () =>
      source().length > WINDOW_ABOVE &&
      !capture.capturing() &&
      !(options.suspendWhile?.() ?? false),
  );

  const range = computed(() => {
    const all = source();
    if (!windowing()) {
      return { start: 0, end: all.length };
    }
    const { top, height } = viewport();
    const px = rowPx();
    const count = Math.ceil(height / px) + OVERSCAN * 2;
    // Clamped to the last full window as well as to zero. The height of the whole table is
    // an estimate, so the foot of the scrollbar and the foot of the list never land on
    // exactly the same pixel; without this the last rows sit past the end of the scroll
    // range and cannot be reached at all.
    const highest = Math.max(0, all.length - count);
    const start = Math.min(highest, Math.max(0, Math.floor(top / px) - OVERSCAN));
    return { start, end: Math.min(all.length, start + count) };
  });

  return {
    rows: computed(() => {
      const { start, end } = range();
      return source().slice(start, end) as T[];
    }),
    padTop: computed(() => (windowing() ? range().start * rowPx() : 0)),
    padBottom: computed(() =>
      windowing() ? Math.max(0, (source().length - range().end) * rowPx()) : 0,
    ),
    windowing,
    _viewport: viewport,
    _rowPx: rowPx,
  };
}

/**
 * The measuring half of {@link rowWindow}: where the table sits, how much of it the
 * viewport covers, and how tall its rows turned out.
 *
 * It watches the page rather than a box of its own. These tables scroll with the document
 * — `.rm-tablewrap` only ever scrolls sideways — so giving each one an inner scroller to
 * virtualise inside would have changed how every screen in the app scrolls, to fix how
 * fast one of them loads.
 */
@Directive({ selector: '[appRowWindow]' })
export class RowWindowDirective {
  readonly appRowWindow = input.required<RowWindow<unknown>>();

  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly injector = inject(Injector);
  private pinned = false;
  private scroller: HTMLElement | null = null;
  private measured = false;

  constructor() {
    const onScroll = () => this.sync();
    const onResize = () => {
      this.scroller = null; // the layout may have handed scrolling to a different box
      this.measured = false; // and rows are a different height once they stack into cards
      this.sync();
    };
    // Capture phase, on the document: a scroll event does not bubble, and in this app the
    // box that scrolls is the shell's <main>, not the window (see shell.css). Listening on
    // window heard nothing, so the table kept rendering the rows it had picked on load and
    // everything past them was blank spacer. Capture hears every scroller on the page,
    // whichever one a screen turns out to use.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    addEventListener('resize', onResize);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      removeEventListener('resize', onResize);
    });

    afterNextRender(() => this.sync(), { injector: this.injector });
  }

  /**
   * Freeze the column widths the table worked out for itself, once.
   *
   * A table sizes its columns from the rows it can see, and a windowed one can only see the
   * rows in the window — so scrolling a new set of descriptions into view re-sizes every
   * column under the reader's eyes. Pinning what the browser already chose, and switching to
   * a fixed layout so it stops re-choosing, holds the table still. Undone when windowing
   * stops, which includes the whole of a print: a capture must lay itself out over its own
   * rows, not over whichever forty were on screen when the shopkeeper hit Print.
   */
  private pinColumns(on: boolean): void {
    const table = this.el.closest('table') as HTMLTableElement | null;
    const head = table?.tHead?.rows[0];
    if (!table || !head) {
      return;
    }
    if (!on) {
      table.style.tableLayout = '';
      for (const cell of head.cells) {
        cell.style.width = '';
      }
      this.pinned = false;
      return;
    }
    if (this.pinned) {
      return;
    }
    const widths = [...head.cells].map((cell) => cell.getBoundingClientRect().width);
    if (widths.some((width) => width <= 0)) {
      return; // not laid out yet (a hidden tab) — try again on the next scroll
    }
    head.cells.length === widths.length &&
      widths.forEach((width, i) => (head.cells[i].style.width = `${width}px`));
    table.style.tableLayout = 'fixed';
    this.pinned = true;
  }

  /**
   * The box this table actually scrolls inside — the shell's `<main>` on most screens, the
   * document on a page that has no shell. Cached, since it means walking ancestors and
   * reading their computed styles; dropped on resize, when a breakpoint may have moved the
   * scrolling to somewhere else.
   */
  private scrollerOf(): HTMLElement | null {
    if (this.scroller) {
      return this.scroller;
    }
    for (let node = this.el.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      const scrollable = overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
      // Both tests, and the second is the one that matters. `.rm-tablewrap` sets only
      // `overflow-x: auto`, and CSS then computes the other axis from `visible` up to
      // `auto` — so on styles alone the wrapper looks like the scroller, and its
      // clientHeight is the whole eight-hundred-thousand-pixel table. Asking whether it
      // actually clips anything vertically tells the wrapper apart from the box that
      // genuinely scrolls.
      if (scrollable && node.scrollHeight > node.clientHeight) {
        this.scroller = node;
        return node;
      }
    }
    // Nothing scrolls yet — a short list, or a tab that has not been laid out. Left
    // uncached deliberately, so the next scroll looks again rather than believing this.
    return null;
  }

  /**
   * Where the visible part of the page falls within the table's own rows, in px from the
   * first one. Measured against whatever is doing the scrolling rather than the window: the
   * two agree only when the document itself scrolls, which here it never does.
   */
  private sync(): void {
    const win = this.appRowWindow();
    if (!win.windowing()) {
      this.pinColumns(false);
      return;
    }
    this.pinColumns(true);
    const scroller = this.scrollerOf();
    const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
    const viewHeight = scroller ? scroller.clientHeight : innerHeight;
    const rect = this.el.getBoundingClientRect();
    win._viewport.set({ top: Math.max(0, viewTop - rect.top), height: viewHeight });
    this.measure();
  }

  /**
   * What the rendered rows actually came to, averaged over them. Spacer rows are skipped —
   * they are the arithmetic's own output, and folding them back in would let a bad estimate
   * confirm itself.
   */
  /**
   * What a row of this table comes to, measured once and then left alone.
   *
   * Re-measuring on every render is the obvious thing and it does not work: the height feeds
   * the range, the range decides which rows render, and those rows feed the height back. Rows
   * here are not uniform — a long description wraps — so each window measured slightly
   * differently, the table's estimated height moved under a scroll position that had not
   * changed, and the view walked backwards. Angular sees the same thing from the other side
   * and reports it as a change-detection loop.
   *
   * One measurement per layout ends it. The height is an estimate either way, and a scrollbar
   * a few percent out is not something anyone notices; a table that will not hold still is.
   * Re-taken on resize, which is when it genuinely changes — a narrow window stacks each row
   * into a card several times the height of a desktop row.
   */
  private measure(): void {
    const win = this.appRowWindow();
    if (this.measured) {
      return;
    }
    const rows = [...this.el.children].filter(
      (child) => !child.classList.contains('rm-rowspacer'),
    );
    if (!rows.length) {
      return;
    }
    const total = rows.reduce((sum, row) => sum + (row as HTMLElement).offsetHeight, 0);
    const average = total / rows.length;
    if (average > 0) {
      this.measured = true;
      if (Math.abs(average - win._rowPx()) > 0.5) {
        win._rowPx.set(average);
      }
    }
  }
}
