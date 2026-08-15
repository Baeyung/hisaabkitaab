import { Component, input } from '@angular/core';

/**
 * Every mark the menu draws, in one place. The sidebar shows one per row at 18px; the board
 * shows one per button at 26px, where a shopkeeper picks the button by its shape before
 * reading the word under it — which is why the set is finer-grained than the sidebar alone
 * needs, and why the entry marks are built as pairs.
 *
 * The pairs are the point. Receipt is an arrow falling *into* the drawer and payment the same
 * arrow rising *out* of it; sale is a tag leaving and purchase a bag arriving. Direction is
 * carried by the drawing, so the board's colour is saying the same thing twice rather than
 * saying it alone — which is what keeps it readable without colour vision.
 */
export type NavIcon =
  | 'dashboard'
  | 'cashbook'
  | 'ledger'
  | 'entry'
  | 'stock'
  | 'bill'
  | 'settings'
  | 'board'
  | 'sale'
  | 'receipt'
  | 'purchase'
  | 'expense'
  | 'payment'
  | 'processing'
  | 'party'
  | 'users'
  | 'items'
  | 'units'
  | 'menu';

@Component({
  selector: 'app-nav-icon',
  // Inline: it is one <svg> per case and nothing else. A component rather than the
  // <ng-template> this used to be in the shell, so the board reaches the same set instead
  // of copying it.
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="weight()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('dashboard') {
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        }
        @case ('cashbook') {
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M4 9h16M9 4v16" />
        }
        @case ('ledger') {
          <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
          <path d="M8 3v18" />
        }
        @case ('entry') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('stock') {
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 7v10l9 4 9-4V7" />
          <path d="M12 11v10" />
        }
        @case ('bill') {
          <path d="M6 2h9l3 3v17l-3-2-3 2-3-2-3 2V2z" />
          <path d="M9 7h6M9 11h6M9 15h4" />
        }
        @case ('settings') {
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
        }
        <!-- The board itself: four buttons, which is what the screen is. -->
        @case ('board') {
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
        }
        <!-- Goods leaving: a price tag on its way out. -->
        @case ('sale') {
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z" />
          <circle cx="7.6" cy="7.6" r="1.2" />
        }
        <!-- Cash falling into the drawer. -->
        @case ('receipt') {
          <path d="M12 3v10M8 9.5l4 4 4-4" />
          <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
        }
        <!-- Goods arriving: the bag you carry back. -->
        @case ('purchase') {
          <path d="M6 7h12l1 13H5z" />
          <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
        }
        <!-- A coin, struck through: money spent on the shop rather than on stock. -->
        @case ('expense') {
          <circle cx="12" cy="12" r="8" />
          <path d="M8.5 12h7" />
        }
        <!-- The receipt mark, reversed: cash leaving the drawer. -->
        @case ('payment') {
          <path d="M12 21V11M8 14.5l4-4 4 4" />
          <path d="M4 9V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
        }
        <!-- Cloth going out to the mill and coming back as something else. -->
        @case ('processing') {
          <path d="M20 12a8 8 0 0 1-8 8 8 8 0 0 1-6.9-4" />
          <path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 6.9 4" />
          <path d="M19 3v5h-5M5 21v-5h5" />
        }
        <!-- The people you trade with: two of them. -->
        @case ('party') {
          <circle cx="9" cy="8" r="3.1" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <path d="M16.2 5.6a3.1 3.1 0 0 1 0 5.6M21 20a5.6 5.6 0 0 0-3.4-4.7" />
        }
        <!-- The people who work the books: one of them, with their seat. -->
        @case ('users') {
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        }
        <!-- A carton of stock. -->
        @case ('items') {
          <path d="M4 8h16v12H4z" />
          <path d="M4 8l2-4h12l2 4" />
          <path d="M10 12h4" />
        }
        <!-- A ruler: the thing that says one gaz is so many metres. -->
        @case ('units') {
          <rect x="3" y="8" width="18" height="8" rx="1.5" />
          <path d="M7.5 8v3.5M12 8v5M16.5 8v3.5" />
        }
        @case ('menu') {
          <path d="M4 7h16M4 12h16M4 17h10" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class NavIconMark {
  readonly name = input.required<NavIcon>();
  readonly size = input(18);
  /** Heavier at board size, so a 26px mark doesn't thin out into a wire drawing. */
  readonly weight = input(1.8);
}
