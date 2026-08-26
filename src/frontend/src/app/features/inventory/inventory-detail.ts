import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { InventoryService } from '../../core/store/inventory.service';
import { StoreItemService } from '../../core/store/store-item.service';
import { StoreService } from '../../core/store/store.service';
import { ItemMovement } from '../../core/store/inventory.models';
import { AmountLegend } from '../../shared/amount-legend';
import { RowWindowDirective, rowWindow } from '../../shared/row-window';

/**
 * One item's movement history with the running on-hand quantity. The item id
 * arrives via router input binding.
 */
@Component({
  selector: 'app-inventory-detail',
  imports: [RouterLink, AmountLegend, RowWindowDirective],
  templateUrl: './inventory-detail.html',
})
export class InventoryDetail {
  readonly itemId = input.required<string>();

  protected readonly locale = inject(LocaleService);

  protected readonly stores = inject(StoreService);
  private readonly api = inject(InventoryService);
  private readonly itemApi = inject(StoreItemService);
  private readonly router = inject(Router);

  protected readonly movement = signal<ItemMovement | null>(null);

  /** Deleting the whole item — owner-only, same as settings/items.ts, but reachable from here. */
  protected readonly confirmingDeleteItem = signal(false);
  protected readonly deletingItem = signal(false);
  protected readonly deleteItemErrorKey = signal<TranslationKey | null>(null);

  /**
   * The rows the table renders. A cloth a shop moves every day runs to thousands of
   * movements — see shared/row-window.ts.
   */
  protected readonly win = rowWindow(computed(() => this.movement()?.rows ?? []));
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly notFound = signal(false);

  constructor() {
    effect(() => {
      void this.load(this.itemId());
    });
  }

  async load(itemId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);
    try {
      this.movement.set(await this.api.getMovement(itemId));
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

  askDeleteItem(): void {
    this.deleteItemErrorKey.set(null);
    this.confirmingDeleteItem.set(true);
  }

  cancelDeleteItem(): void {
    this.confirmingDeleteItem.set(false);
  }

  async confirmDeleteItem(): Promise<void> {
    this.deletingItem.set(true);
    this.deleteItemErrorKey.set(null);
    try {
      await this.itemApi.delete(this.itemId());
      void this.router.navigate(this.stores.link('inventory'));
    } catch {
      this.deleteItemErrorKey.set('error.generic');
      this.deletingItem.set(false);
    }
  }
}
