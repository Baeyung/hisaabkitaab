import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { form, FormField, min, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { UnitConversionService } from '../../core/units/unit-conversion.service';
import { Unit, UnitService } from '../../core/units/unit.service';
import { UnitConversionRate } from '../../core/units/unit-conversion.models';
import { Combobox } from '../../shared/combobox/combobox';
import { ToastService } from '../../shared/toast/toast.service';
import {
  EXAMPLE_CONVERSIONS,
  TRADE_UNIT_EXAMPLES,
  UNIT_SUGGESTIONS,
  builtInFactor,
  formatFactor,
  readableRate,
  sameUnit,
} from '../../core/units/units';

interface RateForm {
  fromUnit: string;
  toUnit: string;
  factor: number | null;
}

interface UnitForm {
  name: string;
}

const EMPTY_DRAFT: RateForm = { fromUnit: '', toUnit: '', factor: null };
const EMPTY_UNIT_DRAFT: UnitForm = { name: '' };

/**
 * Store Settings › Units — two collapsible sections sharing one screen.
 *
 * Manage Units lists every name this store offers on an entry screen's unit box, and is the
 * one place to rename or remove one — a typo caught after the fact, or a unit nobody uses any
 * more. Neither action touches what is already recorded: an item, a transaction line and a
 * conversion rate all carry the unit as their own text, not a reference to this list.
 *
 * Conversions is the rest of what this screen has always done — the fixed table for reference,
 * and this shop's own taught rates, add-able directly or via a preset chip. The from/to boxes
 * are comboboxes over this store's unit list: picking an existing name is one click, and typing
 * one that doesn't exist yet is exactly how a shop "creates" a unit here — the backend resolves
 * or creates it the moment the rate is saved, same as typing a new unit on an item.
 *
 * Same backend, same `UnitConversionService`/`UnitService`: this screen is a second door onto
 * data every entry screen already reads and writes, not a second source of it.
 */
@Component({
  selector: 'app-settings-units',
  imports: [FormField, NgTemplateOutlet, Combobox],
  templateUrl: './units.html',
  styleUrls: ['./settings-table.css', './units.css'],
})
export class SettingsUnits {
  protected readonly locale = inject(LocaleService);
  private readonly stores = inject(StoreService);
  private readonly conversions = inject(UnitConversionService);
  private readonly unitApi = inject(UnitService);
  private readonly toast = inject(ToastService);

  // ── Manage Units ────────────────────────────────────────────────────
  protected readonly units = signal<Unit[] | null>(null);
  protected readonly unitsLoading = signal(true);
  protected readonly unitsLoadError = signal(false);

  protected readonly editingUnitId = signal<string | null>(null);
  protected readonly confirmingUnitId = signal<string | null>(null);
  protected readonly unitSaving = signal(false);
  protected readonly unitErrorKey = signal<TranslationKey | null>(null);

  protected readonly unitDraft = signal<UnitForm>({ ...EMPTY_UNIT_DRAFT });
  protected readonly unitForm = form(this.unitDraft, (p) => {
    required(p.name);
  });

  /** What every entry screen's unit box offers: this store's own list once it loads, falling
   *  back to the built-in defaults for the moment before it does. */
  protected readonly unitSuggestions = computed(() => {
    const list = this.units();
    return list && list.length > 0 ? list.map((u) => u.name) : UNIT_SUGGESTIONS;
  });

  // ── Conversions ─────────────────────────────────────────────────────
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly rates = this.conversions.rates;

  protected readonly adding = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly confirmingRateId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly draft = signal<RateForm>({ ...EMPTY_DRAFT });
  protected readonly rateForm = form(this.draft, (p) => {
    required(p.fromUnit);
    required(p.toUnit);
    required(p.factor);
    // A rate of zero or less is refused by the backend too; caught here first so the
    // shopkeeper sees it before the round trip.
    min(p.factor, 0.00000001);
  });

  protected readonly tradeExamples = TRADE_UNIT_EXAMPLES;
  /** The standard table's examples, with the fixed factor each pair already has. */
  protected readonly standardExamples = EXAMPLE_CONVERSIONS.map((pair) => ({
    ...pair,
    factor: builtInFactor(pair.from, pair.to),
  }));

  /** A unit converts to itself at 1 — there is nothing to store, and the backend refuses it. */
  protected readonly sameUnitPicked = computed(() => sameUnit(this.draft().fromUnit, this.draft().toUnit));

  protected readonly canSave = computed(() => !this.rateForm().invalid() && !this.sameUnitPicked());

  /**
   * Other stores worth offering as a copy target: not this one, not read-only for this user
   * here (a viewer elsewhere couldn't write the rates anyway), and not closed — the backend's
   * `@CurrentStore(EDITOR)` on the receiving end would refuse both regardless, this is only
   * about not offering what would fail.
   */
  protected readonly otherStores = computed(
    () =>
      this.stores
        .stores()
        ?.filter(
          (s) =>
            s.id !== this.stores.currentId() &&
            !s.suspended &&
            (s.role === 'OWNER' || s.role === 'EDITOR'),
        ) ?? [],
  );

  protected readonly copyOpen = signal(false);
  protected readonly copyTargets = signal<ReadonlySet<string>>(new Set());
  protected readonly copying = signal(false);
  protected readonly copyResult = signal<{ ok: number; total: number } | null>(null);

  constructor() {
    void this.loadUnits();
    void this.load();
  }

  // ── Manage Units ────────────────────────────────────────────────────

  async loadUnits(): Promise<void> {
    this.unitsLoading.set(true);
    this.unitsLoadError.set(false);
    try {
      this.units.set(await this.unitApi.list());
    } catch {
      this.unitsLoadError.set(true);
    } finally {
      this.unitsLoading.set(false);
    }
  }

  startEditUnit(unit: Unit): void {
    this.resetUnitRowState();
    this.unitDraft.set({ name: unit.name });
    this.editingUnitId.set(unit.id);
  }

  cancelUnitEdit(): void {
    this.resetUnitRowState();
  }

  async saveUnit(): Promise<void> {
    const id = this.editingUnitId();
    if (id === null || this.unitForm().invalid()) {
      return;
    }
    this.unitSaving.set(true);
    this.unitErrorKey.set(null);
    try {
      const saved = await this.unitApi.rename(id, this.unitDraft().name.trim());
      this.units.update((list) => (list ?? []).map((u) => (u.id === id ? saved : u)));
      this.toast.success(this.locale.t('toast.saved', { label: saved.name }));
      this.resetUnitRowState();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      this.unitErrorKey.set(status === 409 ? 'settings.units.manage.duplicate' : 'error.generic');
    } finally {
      this.unitSaving.set(false);
    }
  }

  askDeleteUnit(id: string): void {
    this.resetUnitRowState();
    this.confirmingUnitId.set(id);
  }

  cancelDeleteUnit(): void {
    this.confirmingUnitId.set(null);
  }

  async confirmDeleteUnit(id: string): Promise<void> {
    this.unitSaving.set(true);
    try {
      const name = this.units()?.find((u) => u.id === id)?.name ?? '';
      await this.unitApi.delete(id);
      this.units.update((list) => (list ?? []).filter((u) => u.id !== id));
      this.confirmingUnitId.set(null);
      this.toast.success(this.locale.t('toast.deleted', { label: name }));
    } catch {
      this.toast.error(this.locale.t('error.generic'));
    } finally {
      this.unitSaving.set(false);
    }
  }

  private resetUnitRowState(): void {
    this.editingUnitId.set(null);
    this.confirmingUnitId.set(null);
    this.unitErrorKey.set(null);
  }

  // ── Conversions ─────────────────────────────────────────────────────

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      await this.conversions.load();
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  startAdd(preset?: { from: string; to: string }): void {
    this.resetRateRowState();
    this.draft.set(preset ? { fromUnit: preset.from, toUnit: preset.to, factor: null } : { ...EMPTY_DRAFT });
    this.adding.set(true);
  }

  startEdit(rate: UnitConversionRate): void {
    this.resetRateRowState();
    this.editingId.set(rate.id);
    const r = readableRate(rate);
    this.draft.set({
      fromUnit: r.fromUnit,
      toUnit: r.toUnit,
      factor: Number(formatFactor(r.factor)),
    });
  }

  cancel(): void {
    this.resetRateRowState();
  }

  protected setDraftUnit(field: 'fromUnit' | 'toUnit', value: string): void {
    this.draft.update((d) => ({ ...d, [field]: value }));
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.errorKey.set(null);
    const d = this.draft();
    const ok = await this.conversions.teach({
      fromUnit: d.fromUnit.trim(),
      toUnit: d.toUnit.trim(),
      factor: d.factor as number,
    });
    this.saving.set(false);
    if (ok) {
      this.toast.success(this.locale.t('toast.saved', { label: `${d.fromUnit} → ${d.toUnit}` }));
      this.cancel();
      // A rate just taught may have created a unit neither box had before — refresh the list
      // Manage Units shows and every combobox on this screen offers.
      void this.loadUnits();
    } else {
      this.errorKey.set('error.generic');
    }
  }

  askDeleteRate(id: string): void {
    this.resetRateRowState();
    this.confirmingRateId.set(id);
  }

  cancelDeleteRate(): void {
    this.confirmingRateId.set(null);
  }

  async confirmDeleteRate(id: string): Promise<void> {
    this.saving.set(true);
    const rate = this.rates().find((r) => r.id === id);
    const ok = await this.conversions.delete(id);
    this.saving.set(false);
    if (ok) {
      this.confirmingRateId.set(null);
      const label = rate ? this.displayRate(rate) : null;
      this.toast.success(
        this.locale.t('toast.deleted', { label: label ? `${label.fromUnit} → ${label.toUnit}` : '' }),
      );
    } else {
      this.toast.error(this.locale.t('error.generic'));
    }
  }

  private resetRateRowState(): void {
    this.adding.set(false);
    this.editingId.set(null);
    this.confirmingRateId.set(null);
    this.errorKey.set(null);
  }

  /** The row as the shop reads it — see {@link readableRate} for why this can differ from
   *  the alphabetically-sorted pair the backend actually stores. */
  protected displayRate(rate: UnitConversionRate): { fromUnit: string; toUnit: string; factor: string } {
    const r = readableRate(rate);
    return { fromUnit: r.fromUnit, toUnit: r.toUnit, factor: formatFactor(r.factor) };
  }

  startCopy(): void {
    this.resetRateRowState();
    this.copyResult.set(null);
    this.copyTargets.set(new Set());
    this.copyOpen.set(true);
  }

  cancelCopy(): void {
    this.copyOpen.set(false);
  }

  toggleCopyTarget(id: string): void {
    this.copyTargets.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async copy(): Promise<void> {
    const ids = [...this.copyTargets()];
    if (ids.length === 0) {
      return;
    }
    this.copying.set(true);
    this.copyResult.set(null);
    const failed = await this.conversions.copyTo(ids);
    this.copying.set(false);
    this.copyResult.set({ ok: ids.length - failed.length, total: ids.length });
    // Only clear the picker on a clean sweep — a partial failure stays open with its
    // targets still checked, so retrying is one click rather than re-picking every store.
    if (failed.length === 0) {
      this.copyOpen.set(false);
    } else {
      this.copyTargets.set(new Set(failed));
    }
  }
}
