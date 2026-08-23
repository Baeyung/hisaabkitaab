import { Component, inject, signal, computed } from '@angular/core';
import { RowWindowDirective, rowWindow } from '../../shared/row-window';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { deleteErrorKey } from '../../core/store/delete-error';
import { EventService } from '../../core/store/event.service';
import { ProcessingService } from '../../core/store/processing.service';
import { StoreService } from '../../core/store/store.service';
import { ProcessingRow } from '../../core/store/processing.models';

/**
 * Every batch this shop has run, newest first. A row names what came out, who it was run
 * for and what it cost to make; opening one goes to {@link ProcessedGoodsDetail} for the
 * recipe — a page that can be linked to, printed, and come back to.
 *
 * Delete stays here as well as on the detail page: taking back a batch just entered is the
 * common case, and it needs no trip through the recipe. It goes through {@link EventService}
 * — a batch is an ordinary transaction, so the entry endpoint reverses both its stock
 * movements and holds a non-owner to the 24-hour window. Prices do not revert, which is why
 * the confirm says so: the weighted average this batch folded into the item cannot be
 * un-averaged.
 */
@Component({
  selector: 'app-processed-goods',
  imports: [RouterLink, RowWindowDirective],
  templateUrl: './processed-goods.html',
})
export class ProcessedGoods {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(ProcessingService);
  private readonly events = inject(EventService);
  private readonly router = inject(Router);

  protected readonly batches = signal<ProcessingRow[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly confirmingId = signal<string | null>(null);

  /**
   * The rows the table renders. Windowing pauses while a delete is being confirmed — that
   * prompt is a row of its own, and scrolling it away would cancel it silently.
   */
  protected readonly win = rowWindow(computed(() => this.batches() ?? []), {
    suspendWhile: () => this.confirmingId() !== null,
  });
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<TranslationKey | null>(null);

  constructor() {
    void this.load();
  }

  /**
   * Who the batch bought from, deduped — a supplier named on three rows is one name here.
   * Falls back to the batch's own party, which only batches booked before the supplier moved
   * onto the rows still carry.
   */
  protected parties(batch: ProcessingRow): string {
    const names = [...batch.rawItems, ...batch.processingItems]
      .map((row) => row.partyName)
      .filter((name): name is string => !!name);
    return [...new Set(names)].join(', ') || (batch.partyName ?? '—');
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.batches.set(await this.api.list());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  open(id: string): void {
    void this.router.navigate(this.stores.link('processing', id));
  }

  askDelete(id: string): void {
    this.confirmingId.set(id);
    this.deleteError.set(null);
  }

  cancelDelete(): void {
    this.confirmingId.set(null);
  }

  async confirmDelete(id: string): Promise<void> {
    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.events.deleteEvent(id);
      this.batches.update((list) => (list ?? []).filter((b) => b.transactionId !== id));
      this.confirmingId.set(null);
    } catch (err) {
      this.deleteError.set(deleteErrorKey(err, 'processing.list.deleteError'));
    } finally {
      this.deleting.set(false);
    }
  }
}
