import { Component, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { BillDetail, BillLine, DocKind } from '../core/store/bill.models';
import { BalanceDirection } from '../core/store/balance.models';
import { directionClass, directionKey, invertDirection, invertInOut } from './balance.util';
import { Perspective } from './print-details.service';
import { StoreService } from '../core/store/store.service';
import { CustomField } from '../core/store/custom-field.models';

/**
 * The wording of one goods document. Keys are passed in as literals rather than
 * built from a prefix because `TranslationKey` is a union of the dictionary's
 * literal keys — concatenation would need a cast and lose the missing-key check.
 */
export interface InvoiceLabels {
  /** Stands in for the document number when it was saved without one. */
  fallbackTitle: TranslationKey;
  /** Who the document is against: "Bill to" on a sale, "Bought from" on a purchase. */
  counterparty: TranslationKey;
  /** Stands in for the party name when there is none — a walk-in, or a one-off supplier. */
  noParty: TranslationKey;
  empty: TranslationKey;
  goodsTotal: TranslationKey;
  /** The cash side: received from the customer, or paid to the supplier. */
  cash: TranslationKey;
  /** What the document left on the khata, whichever way it runs. */
  outstanding: TranslationKey;
  /** What was knocked off the bill: a discount given on a sale, or one taken on a purchase. */
  discount: TranslationKey;
}

/** The sale wording, and the default — every caller that predates purchases means this. */
export const BILL_INVOICE_LABELS: InvoiceLabels = {
  fallbackTitle: 'nav.billManagement',
  counterparty: 'bill.detail.billTo',
  noParty: 'bill.cashSale',
  empty: 'bill.detail.empty',
  goodsTotal: 'bill.detail.goodsTotal',
  cash: 'bill.detail.cashReceived',
  outstanding: 'bill.detail.outstanding',
  discount: 'bill.detail.discount',
};

/**
 * One goods document rendered as an invoice — header (number, date, who it is
 * against), the line-items table and the totals footer. Purely presentational:
 * the parent owns loading/toolbar/delete chrome. Used by the single bill and
 * purchase views and by their "print all" batches, so all four stay identical.
 *
 * A sale and a purchase are the same paper read from opposite sides, so only the
 * wording differs — hence {@link labels}, which defaults to the sale's. Callers
 * that only ever show bills (the cashbook and statement printouts) leave it alone.
 */
@Component({
  selector: 'app-bill-invoice',
  imports: [],
  templateUrl: './bill-invoice.html',
})
export class BillInvoice {
  readonly bill = input.required<BillDetail>();
  readonly labels = input<InvoiceLabels>(BILL_INVOICE_LABELS);
  /** Bills receive cash, purchases pay it out — 'bills' is the default every pre-purchase caller means. */
  readonly kind = input<DocKind>('bills');
  /** Store's own view by default; 'party' flips the outstanding figure's colour/label. */
  readonly perspective = input<Perspective>('store');

  protected readonly locale = inject(LocaleService);
  private readonly stores = inject(StoreService);

  private sided(direction: BalanceDirection): BalanceDirection {
    return this.perspective() === 'party' ? invertDirection(direction) : direction;
  }

  protected toneKey(direction: BalanceDirection) {
    return directionKey(this.sided(direction));
  }

  protected toneClass(direction: BalanceDirection): string {
    return directionClass(this.sided(direction));
  }

  /** The cash line's own colour: green on a bill, red on a purchase, flipped for the party's copy. */
  protected cashClass(): string {
    const inOut = this.kind() === 'bills' ? 'IN' : 'OUT';
    return (this.perspective() === 'party' ? invertInOut(inOut) : inOut) === 'IN' ? 'amt--in' : 'amt--out';
  }

  /**
   * The shop's own columns as this line recorded them, or null for a line that has none —
   * which is every line of every shop running the grid the app ships with, and every line
   * written before this existed. Null is what keeps the familiar `63 Gaz × 100 = 6300`
   * rendering below exactly as it has always been.
   *
   * Read off the line, not off the shop's current arrangement: a bill shows what it was
   * written with. Take a column away in settings and a bill from before it went still reads
   * `3 · 21 · 100 = 6300` rather than dropping a figure and leaving arithmetic that no longer
   * works — the customer is holding the printed copy of the first one.
   *
   * Only the *names* come from the arrangement, because they are all it has to offer: a
   * column that has since been removed has no label left anywhere, and shows its own id.
   * ponytail: labels are not stored per line; storing them would put the shop's whole
   * vocabulary on every row to survive a rename that nobody has asked to survive yet.
   */
  protected cells(line: BillLine): { label: string; value: number }[] | null {
    const stored = line.customFields;
    if (!stored || Object.keys(stored).length === 0) {
      return null;
    }
    const labels = new Map(
      (this.stores.current()?.settings?.customFields?.fields ?? []).map((f) => [f.id, f.label]),
    );
    // Insertion order is the order the columns were in when the line was written — a JSON
    // object keeps it, on both sides of the wire.
    return Object.entries(stored).map(([id, value]) => ({
      label: labels.get(id) || id,
      value,
    }));
  }

  /**
   * The columns this shop has asked to see footed, added up across the bill's lines — ten
   * thans on one line and five on another footing fifteen.
   *
   * Off the shop's current arrangement rather than off the lines, because the request is
   * "show me my thans": a column dropped from the grid is no longer footed even on the bills
   * that recorded it. Lines written before the column existed simply have nothing to add, and
   * a column no line carries is left off rather than footed as a zero.
   */
  protected totals(): { label: string; value: number }[] {
    return footedTotals(this.stores.current()?.settings?.customFields?.fields ?? [], this.bill().lines);
  }
}

/** See {@link BillInvoice.totals} — pulled out so it can be checked without a fixture. */
export function footedTotals(
  fields: readonly CustomField[],
  lines: readonly BillLine[],
): { label: string; value: number }[] {
  return fields
    .filter((f) => f.showTotal)
    .flatMap((f) => {
      const values = lines
        .map((l) => l.customFields?.[f.id])
        .filter((v): v is number => v != null);
      return values.length
        ? [{ label: f.label || f.id, value: values.reduce((sum, v) => sum + v, 0) }]
        : [];
    });
}
