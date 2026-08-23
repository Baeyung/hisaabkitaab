import { ApplicationRef, Injectable, inject, signal } from '@angular/core';

/**
 * Whether the page is being copied rather than looked at.
 *
 * Long tables on this app render only the rows near the viewport (see {@link rowWindow}),
 * which is the difference between a statement opening at once and opening in a second and
 * a half. But a copy of the page is not read through a viewport: the printer walks the
 * whole document, and the WhatsApp/PDF path clones it outright (see printable-html.ts).
 * A windowed table copied as it stands would hand the customer forty rows of an eleven
 * thousand row khata and look, on paper, exactly like a complete statement — which is the
 * kind of wrong that is never noticed until someone disputes a balance.
 *
 * So the windows open for the duration of a copy. Every windowed table on the page reads
 * this one signal, so a page with three of them opens all three together.
 */
@Injectable({ providedIn: 'root' })
export class CaptureModeService {
  private readonly appRef = inject(ApplicationRef);

  /** True while the page is being printed or snapshotted; windowed tables render in full. */
  readonly capturing = signal(false);

  private depth = 0;

  constructor() {
    // The native events, not our own print buttons: they also fire for Ctrl+P and the
    // browser's own menu, which no amount of wrapping our buttons would have caught.
    // Both handlers are synchronous, and a tick() inside beforeprint lands in the DOM
    // before the printer reads it — that is the whole reason this is safe to do here.
    addEventListener('beforeprint', () => this.enter());
    addEventListener('afterprint', () => this.exit());
  }

  /**
   * Render every row, run `body`, then go back to windowing. Counted rather than a plain
   * flag: printing from inside a capture (the statement's WhatsApp send opens the print
   * dialog on some platforms) would otherwise close the windows again halfway through.
   */
  around<T>(body: () => T): T {
    this.enter();
    try {
      return body();
    } finally {
      this.exit();
    }
  }

  private enter(): void {
    if (this.depth++ === 0) {
      this.capturing.set(true);
      this.appRef.tick();
    }
  }

  private exit(): void {
    if (--this.depth <= 0) {
      this.depth = 0;
      this.capturing.set(false);
      this.appRef.tick();
    }
  }
}
