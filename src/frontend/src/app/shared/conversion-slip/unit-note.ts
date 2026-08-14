import { Component, computed, inject, input, output } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { convertQty } from '../../core/units/units';

/**
 * The line under a converted row: what this quantity actually becomes on the shelf.
 *
 * The slip is a moment and then it is gone; this is what is left of it. Without it a row reads
 * "120 Gaz" and saves 109.73 Meter, and the shopkeeper has only their memory of a dialog to go
 * on. With it the row carries its own arithmetic, live — retyping the quantity re-runs it, so
 * the figure is never a stale echo of what was approved.
 *
 * It is a button because the rate is the one part worth revisiting: a than that turned out to
 * be 20 metres and not 22 is corrected from here, not by clearing the unit box and starting
 * the row again.
 */
@Component({
  selector: 'app-unit-note',
  template: `
    @if (show()) {
      <button
        type="button"
        class="uconv"
        (click)="editRate.emit()"
        [attr.aria-label]="
          locale.t('units.note.aria', {
            entered: locale.qtyUnit(qty() ?? 0, unit()),
            shelf: locale.qtyUnit(shelfQty(), stockUnit() ?? ''),
          })
        "
      >
        <svg
          class="uconv__mark"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 8h15l-4-4M20 16H5l4 4" />
        </svg>
        <span class="uconv__fig">{{ locale.qtyUnit(shelfQty(), stockUnit() ?? '') }}</span>
        <span class="uconv__tail">{{ locale.t('units.note.onShelf') }}</span>
      </button>
    }
  `,
  styles: `
    /* The host boxes nothing: a row with no conversion must not leave a flex gap where the
       note would have been, and one with a conversion wants the button to be the flex item. */
    :host {
      display: contents;
    }

    /* Amber and quiet: a standing note that this row is not what it looks like, sized to be
       read after the row rather than instead of it. */
    .uconv {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      max-width: 100%;
      padding: 3px 8px;
      font: inherit;
      font-size: 11.5px;
      line-height: 1.4;
      color: var(--kg-amber);
      background: transparent;
      border: 1px solid var(--kg-line);
      border-radius: 999px;
      cursor: pointer;
    }
    .uconv:hover {
      border-color: var(--kg-amber);
    }
    .uconv:focus-visible {
      outline: 2px solid var(--kg-focus);
      outline-offset: 2px;
    }
    .uconv__mark {
      flex: none;
    }
    .uconv__fig {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .uconv__tail {
      overflow: hidden;
      color: var(--kg-faint);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class UnitNote {
  protected readonly locale = inject(LocaleService);

  /** The quantity as typed, in {@link unit}. */
  readonly qty = input<number | null>(null);
  /** The unit the shopkeeper entered in. */
  readonly unit = input('');
  /** The unit this item's stock is counted in — what the quantity is being turned into. */
  readonly stockUnit = input<string | null>(null);
  /** The agreed rate from {@link unit} to {@link stockUnit}; null when nothing was converted. */
  readonly factor = input<number | null>(null);

  /** Reopen the slip for this row, to correct the rate. */
  readonly editRate = output<void>();

  /** Nothing to say when no rate was agreed, or when it was the identity. */
  protected readonly show = computed(
    () => this.factor() !== null && this.factor() !== 1 && !!this.stockUnit(),
  );

  protected readonly shelfQty = computed(() => convertQty(this.qty() ?? 0, this.factor() ?? 1));
}
