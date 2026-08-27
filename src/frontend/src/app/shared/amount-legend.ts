import { Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { Perspective } from './print-details.service';

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
 * "Credit"/"debit" only means something once you know whose account it is, which is fine on
 * the shop's own screens but not on a page that leaves the shop — a party statement (print or
 * WhatsApp) flips who green and red favour along with everything else on it (see
 * `LedgerDetail.perspective` / `balance.util#invertInOut`), so the caption has to say whose
 * side it's read from too. Passing {@link perspective} swaps the jargon for that: "they were
 * billed"/"they paid you" on the shop's own copy, "you paid"/"you were billed" on the
 * party's. Leave it unset on screens that aren't one party's statement (the cashbook,
 * dashboard, ledger list...) and the legend keeps the plain credit/debit wording.
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
  /** Whose statement this is, on a screen that is one party's — see the class doc. */
  readonly perspective = input<Perspective | null>(null);

  protected readonly keys = computed<{ in: TranslationKey; out: TranslationKey }>(() => {
    if (this.kind() === 'stock') {
      return { in: 'legend.stock.in', out: 'legend.stock.out' };
    }
    switch (this.perspective()) {
      case 'store':
        return { in: 'legend.money.store.in', out: 'legend.money.store.out' };
      case 'party':
        return { in: 'legend.money.party.in', out: 'legend.money.party.out' };
      default:
        return { in: 'legend.money.in', out: 'legend.money.out' };
    }
  });
}
