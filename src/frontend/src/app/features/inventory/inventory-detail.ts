import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { InventoryService } from '../../core/store/inventory.service';
import { ItemMovement } from '../../core/store/inventory.models';

/**
 * One item's movement history with the running on-hand quantity. The item id
 * arrives via router input binding.
 */
@Component({
  selector: 'app-inventory-detail',
  imports: [RouterLink],
  templateUrl: './inventory-detail.html',
})
export class InventoryDetail {
  readonly itemId = input.required<string>();

  protected readonly locale = inject(LocaleService);
  private readonly api = inject(InventoryService);

  protected readonly movement = signal<ItemMovement | null>(null);
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
}
