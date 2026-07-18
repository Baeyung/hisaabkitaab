import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { form, FormField, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreItemService } from '../../core/store/store-item.service';
import { StoreItem, StoreItemDraft } from '../../core/store/store-item.models';

/** Form-facing shape: `unit` is a non-null string for the text input (blank → null on send). */
interface ItemForm {
  name: string;
  unit: string;
  salePrice: number | null;
  costPrice: number | null;
}

const EMPTY_FORM: ItemForm = { name: '', unit: '', salePrice: null, costPrice: null };

/**
 * Store catalog CRUD. Rows edit in place: "Add item" opens a blank editable row,
 * the pencil turns a row editable, and delete asks for confirmation inline (it
 * cascades transactions on the backend, so the confirm says so). Only one row is
 * editable at a time — starting any action cancels the others.
 *
 * With no store yet the list comes back 404; that becomes a "set up your store
 * first" state rather than an error, pointing at General.
 */
@Component({
  selector: 'app-items',
  imports: [FormField, RouterLink, NgTemplateOutlet],
  templateUrl: './items.html',
  styleUrl: './items.css',
})
export class SettingsItems {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(StoreItemService);

  protected readonly items = signal<StoreItem[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noStore = signal(false);

  protected readonly editingId = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly confirmingId = signal<string | null>(null);
  protected readonly openingId = signal<string | null>(null);
  protected readonly openingQty = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly rowErrorKey = signal<TranslationKey | null>(null);

  protected readonly draft = signal<ItemForm>({ ...EMPTY_FORM });
  protected readonly itemForm = form(this.draft, (p) => required(p.name));

  /** Common cloth units as free-text datalist hints; the shopkeeper can type any. */
  protected readonly unitSuggestions = ['Meter', 'Than', 'Gaz', 'Piece', 'Roll'];

  constructor() {
    this.load();
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

  startAdd(): void {
    this.resetRowState();
    this.draft.set({ ...EMPTY_FORM });
    this.adding.set(true);
  }

  startEdit(item: StoreItem): void {
    this.resetRowState();
    this.draft.set({
      name: item.name,
      unit: item.unit ?? '',
      salePrice: item.salePrice,
      costPrice: item.costPrice,
    });
    this.editingId.set(item.id);
  }

  cancelEdit(): void {
    this.resetRowState();
  }

  async save(): Promise<void> {
    if (this.itemForm().invalid()) {
      return;
    }
    this.saving.set(true);
    this.rowErrorKey.set(null);
    const draft = this.normalized();
    try {
      const editId = this.editingId();
      if (editId) {
        const updated = await this.api.update(editId, draft);
        this.items.update((list) => (list ?? []).map((it) => (it.id === editId ? updated : it)));
      } else {
        const created = await this.api.create(draft);
        this.items.update((list) => [created, ...(list ?? [])]);
      }
      this.resetRowState();
    } catch {
      this.rowErrorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  startOpening(item: StoreItem): void {
    this.resetRowState();
    this.openingQty.set(null);
    this.openingId.set(item.id);
  }

  cancelOpening(): void {
    this.resetRowState();
  }

  async saveOpening(id: string): Promise<void> {
    const qty = this.openingQty();
    if (qty == null || qty < 0) {
      return;
    }
    this.saving.set(true);
    this.rowErrorKey.set(null);
    try {
      await this.api.setOpeningStock(id, qty);
      this.resetRowState();
    } catch {
      this.rowErrorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  askDelete(id: string): void {
    this.resetRowState();
    this.confirmingId.set(id);
  }

  cancelDelete(): void {
    this.confirmingId.set(null);
  }

  async confirmDelete(id: string): Promise<void> {
    this.saving.set(true);
    this.rowErrorKey.set(null);
    try {
      await this.api.delete(id);
      this.items.update((list) => (list ?? []).filter((it) => it.id !== id));
      this.confirmingId.set(null);
    } catch {
      this.rowErrorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  /** A price for the table; null → dash, since "no price set" is not "Rs 0". */
  protected money(n: number | null): string {
    return n == null ? '—' : this.locale.money(n);
  }

  /**
   * Per-unit profit (sale − cost) for the margin column, as signed amount, percent,
   * and a tone for colour. Null when either price is missing — nothing to compute.
   */
  protected marginView(sale: number | null, cost: number | null): { amount: string; pct: string; tone: 'pos' | 'neg' | 'zero' } | null {
    if (sale == null || cost == null) {
      return null;
    }
    const m = sale - cost;
    const tone = m > 0 ? 'pos' : m < 0 ? 'neg' : 'zero';
    const pct = cost !== 0 ? this.percent(Math.round((m / cost) * 100)) : '';
    return { amount: this.money(Math.abs(m)), pct, tone };
  }

  private percent(n: number): string {
    return this.locale.formatNumber(n) + '%';
  }

  private resetRowState(): void {
    this.adding.set(false);
    this.editingId.set(null);
    this.confirmingId.set(null);
    this.openingId.set(null);
    this.rowErrorKey.set(null);
  }

  /** Trim text; a blank unit becomes null so the backend stores nothing. */
  private normalized(): StoreItemDraft {
    const d = this.draft();
    const unit = d.unit?.trim();
    return { name: d.name.trim(), unit: unit ? unit : null, salePrice: d.salePrice, costPrice: d.costPrice };
  }
}
