import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CaptureModeService } from './capture-mode.service';
import { RowWindowDirective, rowWindow } from './row-window';

/**
 * The bargain this makes is that the screen may hold back rows and a copy of the page may
 * not. So that is what these check: that a long list is trimmed on screen, that the space
 * it left keeps the scrollbar honest, and — the one that would be expensive to get wrong —
 * that printing or sending brings every row back.
 */
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

/**
 * Comfortably over the windowing threshold, and no further. The real screens that drove
 * this run to five figures, but every assertion here holds at any length above the
 * threshold — and jsdom lays out each row for real, so asking it for eleven thousand
 * bought nothing but a test that took five seconds and tripped its own timeout.
 */
const LONG = 500;

@Component({
  template: `
    <table>
      <tbody [appRowWindow]="win">
        @for (row of win.rows(); track row.id) {
          <tr data-row><td>{{ row.id }}</td></tr>
        }
      </tbody>
    </table>
  `,
  imports: [RowWindowDirective],
})
class Host {
  readonly source = signal(rows(0));
  readonly win = rowWindow(this.source);
}

function host() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture;
}

describe('rowWindow', () => {
  it('renders a short list whole, and withholds nothing', () => {
    const fixture = host();
    const { source, win } = fixture.componentInstance;

    source.set(rows(150));
    fixture.detectChanges();

    expect(win.windowing()).toBe(false);
    expect(win.rows().length).toBe(150);
    expect(win.padTop()).toBe(0);
    expect(win.padBottom()).toBe(0);
  });

  it('trims a long list to a window and keeps the rest as space', () => {
    const fixture = host();
    const { source, win } = fixture.componentInstance;

    source.set(rows(LONG));
    fixture.detectChanges();

    expect(win.windowing()).toBe(true);
    expect(win.rows().length).toBeLessThan(200);
    // The two spacers plus the rendered rows still add up to the whole statement, which is
    // what stops the scrollbar claiming the table is forty rows long.
    const rendered = win.rows().length * 44;
    expect(win.padTop() + rendered + win.padBottom()).toBe(LONG * 44);
  });

  it('renders every row while the page is being captured', () => {
    const fixture = host();
    const { source, win } = fixture.componentInstance;
    const capture = TestBed.inject(CaptureModeService);

    source.set(rows(LONG));
    fixture.detectChanges();
    expect(win.rows().length).toBeLessThan(200);

    // Read inside the capture: that is the only moment the printer and the DOM clone see,
    // and the whole point is that the page is complete for exactly that long.
    const seen = capture.around(() => {
      fixture.detectChanges();
      return { rows: win.rows().length, padTop: win.padTop(), padBottom: win.padBottom() };
    });

    expect(seen.rows).toBe(LONG);
    expect(seen.padTop).toBe(0);
    expect(seen.padBottom).toBe(0);
  });

  it('goes back to windowing once the capture is over', () => {
    const fixture = host();
    const { source, win } = fixture.componentInstance;
    const capture = TestBed.inject(CaptureModeService);

    source.set(rows(LONG));
    fixture.detectChanges();
    capture.around(() => fixture.detectChanges());
    fixture.detectChanges();

    expect(win.windowing()).toBe(true);
    expect(win.rows().length).toBeLessThan(200);
  });

  it('holds the windows open until the outermost capture ends', () => {
    const fixture = host();
    const { source, win } = fixture.componentInstance;
    const capture = TestBed.inject(CaptureModeService);

    source.set(rows(LONG));
    fixture.detectChanges();

    capture.around(() => {
      capture.around(() => fixture.detectChanges());
      // The inner capture finished; a plain flag would have closed the windows here and
      // the outer one would have gone on to copy a trimmed table.
      fixture.detectChanges();
      expect(win.rows().length).toBe(LONG);
    });

    fixture.detectChanges();
    expect(win.windowing()).toBe(true);
  });

  it('can reach the last row, however far past the end the scroll position lands', () => {
    const fixture = host();
    const { source, win } = fixture.componentInstance;

    source.set(rows(LONG));
    fixture.detectChanges();

    // The table's height is an estimate, so the foot of the scrollbar and the foot of the
    // list never agree exactly. Scrolling well past where the last row is thought to be must
    // still land on it rather than on empty spacer — that was the bug on the live screen.
    win._viewport.set({ top: LONG * 44 * 4, height: 800 });
    fixture.detectChanges();

    const ids = win.rows().map((row) => row.id);
    expect(ids.at(-1)).toBe(LONG - 1);
    expect(win.padBottom()).toBe(0);
  });

  it('reacts to a filter that shortens the list below the threshold', () => {
    const fixture = host();
    const { source, win } = fixture.componentInstance;

    source.set(rows(LONG));
    fixture.detectChanges();
    expect(win.windowing()).toBe(true);

    source.set(rows(20));
    fixture.detectChanges();

    expect(win.windowing()).toBe(false);
    expect(win.rows().length).toBe(20);
  });
});
