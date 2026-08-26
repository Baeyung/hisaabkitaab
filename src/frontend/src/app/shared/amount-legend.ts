import { Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';

/** Which pair of words the colours stand for on the screen the legend sits on. */
export type LegendKind = 'money' | 'stock';

/**
 * The key to the green and the red, printed beside the figures they colour.
 *
 * Every screen that shows money leans on the same two colours, and an owner coming off a
 * paper register has no reason to know which way each one points — the app never says so
 * out loud, it just paints the number. This says it out loud, once per screen, in the same
 * words the columns around it already use ({@link ../core/i18n/translations/en} keeps
 * "Cash in"/"Cash out" for the cashbook totals, and this echoes them).
 *
 * Two readings, because the colours do not mean one thing everywhere: on the money screens
 * green is rupees arriving and red is rupees leaving, while on stock screens the same pair
 * is cloth arriving and cloth leaving — a red quantity there is stock gone out (or an item
 * that has been sold past what was ever recorded in), not money owed.
 *
 * The money legend uses "credit"/"debit" (Urdu: jama/banaam) by explicit product decision —
 * a deliberate, scoped exception to the "no accounting jargon" rule in
 * `.claude/APPLICATION_DOMAIN.md` §11. The stock legend is unaffected; it still reads
 * "stock in"/"stock out".
 *
 * It names the colour in text rather than leaving a swatch to do the work, so it still
 * reads on a cheap screen, in greyscale, and to someone who cannot tell the two apart.
 */
@Component({
  selector: 'app-amount-legend',
  template: `
    <p class="rm-legend">
      <span class="rm-legend__item">
        <span class="rm-legend__dot rm-legend__dot--in" aria-hidden="true"></span>
        {{ locale.t(keys().in) }}
      </span>
      <span class="rm-legend__item">
        <span class="rm-legend__dot rm-legend__dot--out" aria-hidden="true"></span>
        {{ locale.t(keys().out) }}
      </span>
    </p>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class AmountLegend {
  protected readonly locale = inject(LocaleService);

  readonly kind = input<LegendKind>('money');

  protected readonly keys = computed<{ in: TranslationKey; out: TranslationKey }>(() =>
    this.kind() === 'stock'
      ? { in: 'legend.stock.in', out: 'legend.stock.out' }
      : { in: 'legend.money.in', out: 'legend.money.out' },
  );
}
