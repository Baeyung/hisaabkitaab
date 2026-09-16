import { Component, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslationKey } from '../core/i18n/translations/en';
import { BillDetail, BillLine, DocKind } from '../core/store/bill.models';
import { BalanceDirection } from '../core/store/balance.models';
import { directionClass, directionKey, invertDirection, invertInOut } from './balance.util';
import { Perspective } from './print-details.service';
import { StoreService } from '../core/store/store.service';
import {
  CustomField,
  DEFAULT_CUSTOM_FIELDS,
  DEFAULT_QTY_FIELD,
  DEFAULT_RATE_FIELD,
  storedValues,
} from '../core/store/custom-field.models';

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
   * The grid's columns between the item and the amount, as the bill's lines recorded them —
   * one per stored column, in the order they were written. A line written before this shop
   * had columns of its own reads as the two the app has always had, quantity and rate, so
   * every bill lands in the same grid and the figures of one line sit under the figures of
   * the next: the printed copy is checked by running a finger down a column.
   *
   * Read off the lines, not off the shop's current arrangement: a bill shows what it was
   * written with. Take a column away in settings and a bill from before it went still shows
   * `3 · 21 · 100 = 6300` rather than dropping a figure and leaving arithmetic that no longer
   * works — the customer is holding the printed copy of the first one.
   *
   * Only the *names* come from the arrangement, because they are all it has to offer: a
   * column that has since been removed has no label left anywhere, and shows its own id.
   * ponytail: labels are not stored per line; storing them would put the shop's whole
   * vocabulary on every row to survive a rename that nobody has asked to survive yet.
   */
  protected columns(): InvoiceColumn[] {
    return invoiceColumns(this.bill().lines, this.fields(), (id) =>
      this.locale.t(id === DEFAULT_QTY_FIELD ? 'bill.detail.col.qty' : 'bill.detail.col.rate'),
    );
  }

  /**
   * Whether a column holds a price, so the bill puts a currency on it — the rate column, which
   * on the grid the app ships with is `rate` and has always printed as money. A count of thans
   * is not money and reads wrong with "Rs" in front of it. Mirrors the entry screen.
   */
  protected isMoneyColumn(id: string): boolean {
    return id === (this.stores.current()?.settings?.customFields ?? DEFAULT_CUSTOM_FIELDS).rateField;
  }

  /** What this line recorded under a column, as that column shows it — blank where nothing was. */
  protected cell(line: BillLine, id: string): string {
    const value = storedValues(line.customFields, line.quantity, line.rate)[id];
    if (value == null) {
      return '';
    }
    return this.isMoneyColumn(id) ? this.locale.money(value) : this.locale.formatNumber(value);
  }

  /**
   * The bill's lines gathered under the item they are for, in the order the items first
   * appear. Three lines of design A — written apart because their columns differed, not
   * because the design did — read under the name once instead of spelling it out three
   * times. Nothing is dropped or added up: this only moves rows next to each other.
   *
   * Keyed on the item where the line has one and on the name where it hasn't, the same way
   * {@link sumItems} keys its rollup, so two free-text lines typed alike still gather.
   */
  protected groups(): BillGroup[] {
    return groupLines(this.bill().lines, this.fields());
  }

  /**
   * The columns this shop has asked to see footed, added up across the bill's lines — ten
   * thans on one line and five on another footing fifteen. Keyed by column, so each total
   * lands in the grid directly under the figures it adds up.
   *
   * Off the shop's current arrangement rather than off the lines, because the request is
   * "show me my thans": a column dropped from the grid is no longer footed even on the bills
   * that recorded it. Lines written before the column existed simply have nothing to add, and
   * a column no line carries is left off rather than footed as a zero.
   */
  protected totals(): Map<string, number> {
    return new Map(footedTotals(this.fields(), this.bill().lines).map((t) => [t.id, t.value]));
  }

  /** The item's own footed figure under a column, or blank where the item took one line. */
  protected groupTotal(group: BillGroup, id: string): string {
    const found = group.totals.find((t) => t.id === id);
    return found ? this.locale.formatNumber(found.value) : '';
  }

  /** A bill-level footed figure under a column, or blank where the column isn't footed. */
  protected total(id: string): string {
    const value = this.totals().get(id);
    return value == null ? '' : this.locale.formatNumber(value);
  }

  private fields(): readonly CustomField[] {
    return this.stores.current()?.settings?.customFields?.fields ?? [];
  }
}

/** One column of the bill's grid — see {@link BillInvoice.columns}. */
export interface InvoiceColumn {
  id: string;
  label: string;
}

/** A footed figure, keyed by the column it foots so it can sit under that column. */
export interface FootedTotal {
  id: string;
  label: string;
  value: number;
}

/**
 * See {@link BillInvoice.columns} — pulled out so it can be checked without a fixture.
 * `defaultLabel` names the two built-in columns, whose arrangement entries carry no label of
 * their own because theirs follow the language.
 */
export function invoiceColumns(
  lines: readonly BillLine[],
  fields: readonly CustomField[],
  defaultLabel: (id: string) => string,
): InvoiceColumn[] {
  const ids: string[] = [];
  for (const line of lines) {
    // Insertion order is the order the columns were in when the line was written — a JSON
    // object keeps it, on both sides of the wire.
    for (const id of Object.keys(storedValues(line.customFields, line.quantity, line.rate))) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  const labels = new Map(fields.map((f) => [f.id, f.label]));
  return ids.map((id) => ({
    id,
    label:
      labels.get(id) ||
      (id === DEFAULT_QTY_FIELD || id === DEFAULT_RATE_FIELD ? defaultLabel(id) : id),
  }));
}

/** See {@link BillInvoice.totals} — pulled out so it can be checked without a fixture. */
export function footedTotals(
  fields: readonly CustomField[],
  lines: readonly BillLine[],
): FootedTotal[] {
  return fields
    .filter((f) => f.showTotal)
    .flatMap((f) => {
      const values = lines
        .map((l) => l.customFields?.[f.id])
        .filter((v): v is number => v != null);
      return values.length
        ? [{ id: f.id, label: f.label || f.id, value: values.reduce((sum, v) => sum + v, 0) }]
        : [];
    });
}

/** One item's worth of a bill — see {@link BillInvoice.groups}. */
export interface BillGroup {
  name: string;
  lines: BillLine[];
  /**
   * The group's own footed columns: ten thans on one of its lines and five on another read
   * as fifteen against the item. Empty where the item took a single line, since a foot there
   * would only restate the figure directly above it.
   */
  totals: FootedTotal[];
}

/** See {@link BillInvoice.groups} — pulled out so it can be checked without a fixture. */
export function groupLines(
  lines: readonly BillLine[],
  fields: readonly CustomField[] = [],
): BillGroup[] {
  const byItem = new Map<string, BillLine[]>();
  for (const line of lines) {
    const key = line.itemId ?? line.itemName ?? '';
    const found = byItem.get(key);
    if (found) {
      found.push(line);
    } else {
      byItem.set(key, [line]);
    }
  }
  return [...byItem.values()].map((group) => ({
    name: group[0].itemName || '\u2014',
    lines: group,
    totals: group.length > 1 ? footedTotals(fields, group) : [],
  }));
}
