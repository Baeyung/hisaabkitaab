import { Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { Balance } from '../core/store/balance.models';
import { directionClass, directionKey } from './balance.util';

/** What the khata figure on a row actually is, once the row is read. */
type KhataKind = 'none' | 'khata' | 'discount';

/**
 * The "on khata" cell: how much of an entry did *not* settle in cash, shown beside the
 * amount that did. The bill and purchase lists and the cashbook all hang this off their
 * amount column, so the reading is decided once here rather than three times in markup.
 *
 * Three states, told apart the way {@link ./balance.util} and the document detail page
 * already tell them apart:
 *
 * - nothing outstanding — an em dash, and the cell drops off the phone layout entirely
 *   rather than adding a blank fact to the meta line;
 * - a party is on the entry — the amount, coloured by direction. Green is money moving
 *   towards the shop (a customer's baqaya going up, a supplier's coming down), red the
 *   other way. Same mapping as the ledger's balances, so one colour means one thing
 *   across every screen;
 * - nobody is on the entry — there is no khata to put it on, so the gap between the
 *   goods and the cash is a discount, and it says so.
 *
 * Colour never carries the direction alone: the ledger's own wording for it rides along
 * for screen readers, since the figure beside it is only a rupee amount.
 */
@Component({
  selector: 'app-khata-amount',
  template: `
    @switch (kind()) {
      @case ('none') {
        <span class="rm-tbl__name amt--settled" aria-hidden="true">—</span>
        <span class="sr-only">{{ locale.t('khata.none') }}</span>
      }
      @case ('discount') {
        <span class="num rm-tbl__name amt--settled">{{ locale.money(balance().amount) }}</span>
        <span class="rm-tbl__meta">{{ locale.t(discountLabel()) }}</span>
      }
      @default {
        <span class="num rm-tbl__name" [class]="tone()">{{ locale.money(balance().amount) }}</span>
        <span class="sr-only">{{ locale.t(word()) }}</span>
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  host: {
    // The phone layout hides the whole cell on this — see .rm-tbl td:has() in styles.css.
    '[class.is-empty]': "kind() === 'none'",
  },
})
export class KhataAmount {
  /** The entry's effect on its party's khata, straight off the row. */
  readonly balance = input.required<Balance>();
  /** Null on a walk-in cash entry — which is what makes an unbalanced one a discount. */
  readonly partyName = input<string | null>(null);
  /** What this screen calls a discount: one given on a sale, or one taken on a purchase. */
  readonly discountLabel = input.required<TranslationKey>();

  protected readonly locale = inject(LocaleService);

  protected readonly kind = computed<KhataKind>(() => {
    if (this.balance().direction === 'SETTLED') {
      return 'none';
    }
    return this.partyName() ? 'khata' : 'discount';
  });

  protected readonly tone = computed(() => directionClass(this.balance().direction));
  protected readonly word = computed(() => directionKey(this.balance().direction));
}
