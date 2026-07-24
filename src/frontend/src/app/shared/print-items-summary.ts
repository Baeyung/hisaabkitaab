import { Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '../core/i18n/locale.service';
import { BillDetail } from '../core/store/bill.models';

export interface ItemMovement {
  name: string;
  unit: string | null;
  quantity: number;
  amount: number;
}

/**
 * Roll a run of bills up into one line per item — how much of it left the shelf
 * and what it brought in. Keyed by item *and* unit: the same item sold by bag
 * and by kg can't have its quantities added, so those stay separate rows.
 * Biggest earner first. A line with no quantity (a flat-priced entry) still
 * counts towards the amount.
 */
export function sumItems(bills: BillDetail[]): ItemMovement[] {
  const byItem = new Map<string, ItemMovement>();
  for (const bill of bills) {
    for (const line of bill.lines) {
      const name = line.itemName || '—';
      const key = `${line.itemId ?? name}|${line.unit ?? ''}`;
      const row = byItem.get(key) ?? { name, unit: line.unit, quantity: 0, amount: 0 };
      row.quantity += line.quantity ?? 0;
      row.amount += line.amount;
      byItem.set(key, row);
    }
  }
  return [...byItem.values()].sort((a, b) => b.amount - a.amount);
}

/**
 * Print-only "items sold" table closing a cashbook / bill report: what moved
 * across every bill in the printed range, so the shopkeeper reads the stock
 * story without paging through each bill. Hidden on screen (:host), like
 * <app-print-header>. Kept off a page boundary where it fits, and its header
 * repeats if it doesn't.
 */
@Component({
  selector: 'app-print-items-summary',
  template: `
    @if (items().length) {
      <section class="pi-wrap">
        <h2 class="pi-title">{{ locale.t('print.items.title') }}</h2>
        <table class="rm-tbl">
          <thead>
            <tr>
              <th scope="col">{{ locale.t('bill.detail.col.item') }}</th>
              <th scope="col" class="end">{{ locale.t('bill.detail.col.qty') }}</th>
              <th scope="col" class="end">{{ locale.t('bill.detail.col.amount') }}</th>
            </tr>
          </thead>
          <tbody>
            @for (item of items(); track $index) {
              <tr>
                <td>{{ item.name }}</td>
                <td class="end num">
                  {{ item.quantity ? locale.formatNumber(item.quantity) : '—'
                  }}{{ item.quantity && item.unit ? ' ' + item.unit : '' }}
                </td>
                <td class="end num">{{ locale.money(item.amount) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
  styles: `
    :host {
      display: none;
    }
    @media print {
      :host {
        display: block;
      }
      .pi-wrap {
        margin-top: 16px;
        /* Short summaries ride along on the last page; one too tall to fit is
           pushed onto its own, where it flows with a repeating header. */
        break-inside: avoid;
      }
      .pi-title {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 700;
        border-top: 1px solid #000;
        padding-top: 8px;
      }
    }
  `,
})
export class PrintItemsSummary {
  readonly bills = input.required<BillDetail[]>();

  protected readonly locale = inject(LocaleService);
  protected readonly items = computed(() => sumItems(this.bills()));
}
