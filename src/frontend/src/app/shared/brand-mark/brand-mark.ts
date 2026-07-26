import { Component } from '@angular/core';

/**
 * The khata mark: an open ledger, two pages with an amber rule across the top
 * of each. Same geometry as the app icon and favicon, so the browser tab, the
 * home-screen icon, and the in-app brand read as one mark.
 *
 * Pages are drawn in `currentColor` and the field is the container's own
 * background, so the mark inverts correctly wherever it is placed — cream
 * pages on the pine topbar, pine pages on the cream auth hero.
 */
@Component({
  selector: 'app-brand-mark',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="page" d="M3.4 2.5h8v19h-8zM12.6 2.5h8v19h-8z" />
      <path class="rule" d="M3.4 5.1h8v2.6h-8zM12.6 5.1h8v2.6h-8z" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 68%;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .page {
      fill: currentColor;
    }
    .rule {
      fill: var(--kg-amber);
    }
  `,
})
export class BrandMark {}
