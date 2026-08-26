import { Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { Balance } from '../core/store/balance.models';
import { directionClass, directionKey } from './balance.util';

/** What the khata figure on a row actually is, once the row is read. */
type KhataKind = 'none' | 'khata' | 'discount';

/**
 * The "on khata" cell: how much of an entry is still owed, shown beside the amount that
 * settled in cash. The bill and purchase lists and the cashbook all hang this off their
 * amount column, so the reading is decided once here rather than three times in markup.
 *
 * Three states:
 *
 * - nothing owed and no discount on it — an em dash, and the cell drops off the phone
 *   layout entirely rather than adding a blank fact to the meta line;
 * - a party is on the entry and still owes something — the amount, coloured by
 *   direction. Green is money moving towards the shop (a customer's baqaya going up, a
 *   supplier's coming down), red the other way. Same mapping as the ledger's balances,
 *   so one colour means one thing across every screen;
 * - otherwise, a discount was entered on it — explicit now, not inferred from an
 *   unbalanced document with nobody on it, so this reads the same for a walk-in or a
 *   khata party once their balance is settled.
 *
 * A document can carry both a khata balance and a discount at once (see
 * {@link ../features/new-entry/goods-entry}); this compact cell only has room for one, so
 * it favours the collectible khata figure and leaves the discount to the document's own
 * detail page and print totals, where both show.
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
        <span class="num rm-tbl__name amt--settled">{{ locale.money(discount()) }}</span>
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
  /** Null on a walk-in cash entry — a khata balance never shows without a party on it. */
  readonly partyName = input<string | null>(null);
  /** Explicit now — entered on the entry screen, not inferred from an unbalanced document. */
  readonly discount = input<number>(0);
  /** What this screen calls a discount: one given on a sale, or one taken on a purchase. */
  readonly discountLabel = input.required<TranslationKey>();

  protected readonly locale = inject(LocaleService);

  protected readonly kind = computed<KhataKind>(() => {
    if (this.partyName() && this.balance().direction !== 'SETTLED') {
      return 'khata';
    }
    return this.discount() > 0 ? 'discount' : 'none';
  });

  protected readonly tone = computed(() => directionClass(this.balance().direction));
  protected readonly word = computed(() => directionKey(this.balance().direction));
}
