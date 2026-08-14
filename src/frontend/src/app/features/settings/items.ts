import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { form, FormField, min, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { StoreService } from '../../core/store/store.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreItemService } from '../../core/store/store-item.service';
import { StoreItem, StoreItemDraft } from '../../core/store/store-item.models';
import { UnitConversionService } from '../../core/units/unit-conversion.service';
import { ConversionSlipService } from '../../shared/conversion-slip/conversion-slip.service';
import { UnitNote } from '../../shared/conversion-slip/unit-note';
import { UNIT_SUGGESTIONS, convertQty, sameUnit } from '../../core/units/units';

/** Form-facing shape: `unit` is a non-null string for the text input (blank → null on send). */
interface ItemForm {
  name: string;
  unit: string;
  salePrice: number | null;
  costPrice: number | null;
  service: boolean;
  /** Saved through its own endpoint after the item itself, not part of the draft. */
  openingStock: number | null;
}

const EMPTY_FORM: ItemForm = {
  name: '',
  unit: '',
  salePrice: null,
  costPrice: null,
  service: false,
  openingStock: null,
};

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
  imports: [FormField, NgTemplateOutlet, UnitNote],
  templateUrl: './items.html',
  styleUrl: './items.css',
})
export class SettingsItems {
  protected readonly locale = inject(LocaleService);
  private readonly api = inject(StoreItemService);
  /** Deleting an item is the owner's — it erases everything booked against it. */
  protected readonly stores = inject(StoreService);
  private readonly conversions = inject(UnitConversionService);
  private readonly slip = inject(ConversionSlipService);

  protected readonly items = signal<StoreItem[] | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);

  protected readonly editingId = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly confirmingId = signal<string | null>(null);
  protected readonly openingId = signal<string | null>(null);
  protected readonly openingQty = signal<number | null>(null);
  /**
   * The unit the opening quantity is being counted in, prefilled from the item. Opening stock
   * is the one figure a shopkeeper is most likely to have in trade units — the shelf holds
   * four than of this, whatever a than turns out to be in metres — so it is worth asking about
   * here even though the item's own unit is being set two rows above.
   */
  protected readonly openingUnit = signal('');
  protected readonly openingFactor = signal<number | null>(null);
  /** The pair that rate was agreed for, so switching to a third unit asks again. */
  private readonly openingFactorFor = signal<string | null>(null);
  /** What the row's opening stock was when the editor opened — only a change is sent. */
  private readonly openingBefore = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly rowErrorKey = signal<TranslationKey | null>(null);

  protected readonly draft = signal<ItemForm>({ ...EMPTY_FORM });
  protected readonly itemForm = form(this.draft, (p) => {
    required(p.name);
    min(p.openingStock, 0);
  });

  /**
   * Free-text datalist hints; the shopkeeper can still type any. Shared with the entry screens
   * so the same names are offered everywhere — a unit typed one way here and another way on a
   * sale is a unit the app has to be taught twice.
   */
  protected readonly unitSuggestions = UNIT_SUGGESTIONS;

  constructor() {
    this.load();
    // For the opening-stock editor below; swallows its own failure.
    void this.conversions.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      this.items.set(await this.api.list());
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  startAdd(): void {
    this.resetRowState();
    this.draft.set({ ...EMPTY_FORM });
    this.openingBefore.set(null);
    this.adding.set(true);
  }

  startEdit(item: StoreItem): void {
    this.resetRowState();
    this.draft.set({
      name: item.name,
      unit: item.unit ?? '',
      salePrice: item.salePrice,
      costPrice: item.costPrice,
      service: item.service,
      openingStock: item.openingStock ?? null,
    });
    this.openingBefore.set(item.openingStock ?? null);
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
      const saved = editId ? await this.api.update(editId, draft) : await this.api.create(draft);
      // Create/update do not carry opening stock, so it rides its own endpoint —
      // and only when it actually moved. A service holds none, so it clears.
      const withOpening = {
        ...saved,
        openingStock: await this.syncOpening(saved.id, draft.service),
      };
      if (editId) {
        this.items.update((list) =>
          (list ?? []).map((it) => (it.id === editId ? withOpening : it)),
        );
      } else {
        this.items.update((list) => [withOpening, ...(list ?? [])]);
      }
      this.resetRowState();
    } catch {
      this.rowErrorKey.set('error.generic');
    } finally {
      this.saving.set(false);
    }
  }

  /** Pushes the editor's opening stock if it changed; returns what the row should now show. */
  private async syncOpening(id: string, service: boolean): Promise<number | null> {
    const wanted = service ? null : this.draft().openingStock;
    if (wanted === this.openingBefore()) {
      return this.openingBefore();
    }
    const stored = await this.api.setOpeningStock(id, wanted ?? 0);
    return stored > 0 ? stored : null;
  }

  startOpening(item: StoreItem): void {
    this.resetRowState();
    // Prefill from the current opening so re-opening shows what was entered. The stored figure
    // is always in the item's own unit, so the editor starts there with nothing to convert.
    this.openingQty.set(item.openingStock ?? null);
    this.openingUnit.set(item.unit?.trim() ?? '');
    this.openingFactor.set(null);
    this.openingId.set(item.id);
  }

  cancelOpening(): void {
    this.resetRowState();
  }

  /**
   * The opening editor's unit box was left. Same bargain as the entry screens: anything but
   * the item's own unit is converted through the slip, and declining puts the box back.
   */
  async askOpeningUnit(item: StoreItem, force = false): Promise<void> {
    const stock = item.unit?.trim() ?? '';
    const entered = this.openingUnit().trim();

    const pair = `${entered.toLowerCase()}>${stock.toLowerCase()}`;

    if (!stock || !entered || sameUnit(entered, stock)) {
      this.openingFactor.set(null);
      this.openingFactorFor.set(null);
      return;
    }
    if (!force && this.openingFactorFor() === pair) {
      return;
    }

    const answer = await this.slip.open({
      itemName: item.name,
      from: entered,
      to: stock,
      qty: this.openingQty(),
    });

    if (answer === null) {
      this.openingUnit.set(stock);
      this.openingFactor.set(null);
      this.openingFactorFor.set(null);
    } else {
      this.openingFactor.set(answer.factor);
      this.openingFactorFor.set(pair);
    }
  }

  async saveOpening(id: string): Promise<void> {
    const typed = this.openingQty();
    if (typed == null || typed < 0) {
      return;
    }
    // Opening stock is stock: it lands on the shelf in the item's own unit, whatever unit it
    // was counted in.
    const factor = this.openingFactor();
    const qty = factor ? convertQty(typed, factor) : typed;
    this.saving.set(true);
    this.rowErrorKey.set(null);
    try {
      const stored = await this.api.setOpeningStock(id, qty);
      const openingStock = stored > 0 ? stored : null;
      this.items.update((list) =>
        (list ?? []).map((it) => (it.id === id ? { ...it, openingStock } : it)),
      );
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
  protected marginView(
    sale: number | null,
    cost: number | null,
  ): { amount: string; pct: string; tone: 'pos' | 'neg' | 'zero' } | null {
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
    this.openingUnit.set('');
    this.openingFactor.set(null);
    this.openingFactorFor.set(null);
    this.rowErrorKey.set(null);
  }

  /** Trim text; a blank unit becomes null so the backend stores nothing. */
  private normalized(): StoreItemDraft {
    const d = this.draft();
    const unit = d.unit?.trim();
    return {
      name: d.name.trim(),
      unit: unit ? unit : null,
      salePrice: d.salePrice,
      costPrice: d.costPrice,
      service: d.service,
    };
  }
}
