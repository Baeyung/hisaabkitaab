import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { BillService } from '../../core/store/bill.service';
import { BillDetail as BillDetailModel } from '../../core/store/bill.models';
import { directionClass, directionKey } from '../../shared/balance.util';

/**
 * One bill, derived from its SALE transaction: line items, goods total, cash
 * received, and what went on the khata. The transaction id arrives via router
 * input binding.
 */
@Component({
  selector: 'app-bill-detail',
  imports: [RouterLink],
  templateUrl: './bill-detail.html',
})
export class BillDetail {
  readonly billId = input.required<string>();

  protected readonly locale = inject(LocaleService);
  private readonly api = inject(BillService);

  protected readonly bill = signal<BillDetailModel | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  protected readonly directionKey = directionKey;
  protected readonly directionClass = directionClass;

  constructor() {
    effect(() => {
      void this.load(this.billId());
    });
  }

  async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    try {
      this.bill.set(await this.api.getDetail(id));
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.notFound.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
