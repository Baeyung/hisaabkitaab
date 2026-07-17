import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocaleService } from '../../core/i18n/locale.service';
import { InventoryService } from '../../core/store/inventory.service';
import { ItemStockRow } from '../../core/store/inventory.models';

/**
 * Stock list: every item with its current on-hand quantity, searchable by
 * name/design number. Rows open the item's movement history.
 */
@Component({
  selector: 'app-inventory',
  imports: [RouterLink],
  templateUrl: './inventory.html',
})
export class Inventory {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(InventoryService);
  private readonly router = inject(Router);

  protected readonly items = signal<ItemStockRow[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noStore = signal(false);
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.items() ?? [];
    return q ? all.filter((item) => item.name.toLowerCase().includes(q)) : all;
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.noStore.set(false);
    try {
      this.items.set(await this.api.list());
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        this.noStore.set(true);
      } else {
        this.loadError.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }

  open(itemId: string): void {
    void this.router.navigate(['/inventory', itemId]);
  }
}
