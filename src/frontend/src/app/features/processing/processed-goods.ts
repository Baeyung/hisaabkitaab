import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { deleteErrorKey } from '../../core/store/delete-error';
import { EventService } from '../../core/store/event.service';
import { ProcessingService } from '../../core/store/processing.service';
import { StoreService } from '../../core/store/store.service';
import { ProcessingRow } from '../../core/store/processing.models';

/**
 * Every batch this shop has run, newest first. A row names what came out and what it cost
 * to make; expanding it shows the recipe — the raw material and the consumables, each with
 * what it contributed.
 *
 * Rows expand in place rather than opening a detail route: a batch is a handful of lines
 * already loaded with the list, so a second screen would only be a second fetch.
 *
 * Delete goes through {@link EventService} — a batch is an ordinary transaction, so the
 * entry endpoint already reverses both its stock movements and holds a non-owner to the
 * 24-hour window. Prices do not revert, which is why the confirm says so: the weighted
 * average this batch folded into the item cannot be un-averaged.
 */
@Component({
  selector: 'app-processed-goods',
  imports: [RouterLink],
  templateUrl: './processed-goods.html',
})
export class ProcessedGoods {
  protected readonly locale = inject(LocaleService);
  protected readonly stores = inject(StoreService);
  private readonly api = inject(ProcessingService);
  private readonly events = inject(EventService);

  protected readonly batches = signal<ProcessingRow[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly expandedId = signal<string | null>(null);
  protected readonly confirmingId = signal<string | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<TranslationKey | null>(null);

  constructor() {
    void this.load();
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

  toggle(id: string): void {
    this.expandedId.update((open) => (open === id ? null : id));
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

  /** What a recipe row contributed to the batch's cost. */
  lineAmount(row: { quantity: number | null; pricePerUnit: number | null }): number {
    return (row.quantity ?? 0) * (row.pricePerUnit ?? 0);
  }
}
