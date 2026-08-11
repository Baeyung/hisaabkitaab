import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { deleteErrorKey } from '../../core/store/delete-error';
import { EventService } from '../../core/store/event.service';
import { ProcessingService } from '../../core/store/processing.service';
import { StoreService } from '../../core/store/store.service';
import { ProcessingRow, ProcessingRowInput } from '../../core/store/processing.models';
import { PrintHeader } from '../../shared/print-header';
import { WhatsAppButton } from '../../shared/whatsapp-button';

/**
 * One batch on its own page: what it made, what it was made from, and what it cost — the
 * recipe a shopkeeper hands over or files. Reached from the list and from the party's
 * khata, so it is a real route rather than the row that used to expand in place: a link
 * can be sent, printed, and come back to.
 *
 * Delete goes through {@link EventService} — a batch is an ordinary transaction, so the
 * entry endpoint reverses its stock movements and holds a non-owner to the 24-hour window.
 * Prices do not revert, which is why the confirm says so: the weighted average this batch
 * folded into the item cannot be un-averaged.
 */
@Component({
  selector: 'app-processed-goods-detail',
  imports: [RouterLink, PrintHeader, WhatsAppButton],
  templateUrl: './processed-goods-detail.html',
})
export class ProcessedGoodsDetail {
  readonly transactionId = input.required<string>();

  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(ProcessingService);
  private readonly events = inject(EventService);
  private readonly router = inject(Router);

  protected readonly batch = signal<ProcessingRow | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<TranslationKey | null>(null);

  /** Both input sides in one table, each row labelled by which side it came from. */
  protected readonly inputs = computed(() => {
    const b = this.batch();
    const rows = (list: ProcessingRowInput[], kind: TranslationKey) =>
      list.map((row) => ({ ...row, kind, amount: (row.quantity ?? 0) * (row.pricePerUnit ?? 0) }));
    return b ? [...rows(b.rawItems, 'processing.raw'), ...rows(b.processingItems, 'processing.items')] : [];
  });

  /** What the batch consumed, in money — the figure its cost/unit was divided out of. */
  protected readonly totalCost = computed(() =>
    this.inputs().reduce((sum, row) => sum + row.amount, 0),
  );

  constructor() {
    effect(() => {
      void this.load(this.transactionId());
    });
  }

  async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    try {
      this.batch.set(await this.api.get(id));
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

  print(): void {
    window.print();
  }

  askDelete(): void {
    this.deleteError.set(null);
    this.confirming.set(true);
  }

  cancelDelete(): void {
    this.confirming.set(false);
  }

  async confirmDelete(): Promise<void> {
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.events.deleteEvent(this.transactionId());
      void this.router.navigate(this.stores.link('processing'));
    } catch (err) {
      this.deleteError.set(deleteErrorKey(err, 'processing.list.deleteError'));
      this.deleting.set(false);
    }
  }
}
