import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { form, FormField, min, required } from '@angular/forms/signals';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreService } from '../../core/store/store.service';
import { UnitConversionService } from '../../core/units/unit-conversion.service';
import { UnitService } from '../../core/units/unit.service';
import { UnitConversionRate } from '../../core/units/unit-conversion.models';
import {
  EXAMPLE_CONVERSIONS,
  TRADE_UNIT_EXAMPLES,
  UNIT_SUGGESTIONS,
  builtInFactor,
  formatFactor,
  sameUnit,
} from '../../core/units/units';

interface RateForm {
  fromUnit: string;
  toUnit: string;
  factor: number | null;
}

const EMPTY_DRAFT: RateForm = { fromUnit: '', toUnit: '', factor: null };

/**
 * Store Settings › Unit Conversions — the one place this shop's conversion rates live, rather
 * than only ever being taught in passing from the conversion slip mid-entry. Same backend, same
 * `UnitConversionService`: this screen is a second door onto the rates the slip already reads
 * and writes, not a second source of them.
 *
 * Two lists. The standard table ({@link EXAMPLE_CONVERSIONS}) is read-only and exists to show
 * what a conversion looks like — it needs nothing from this shop because it is the same
 * everywhere. Below it are this shop's own rates: the trade units nobody but this shop can
 * answer for, add-able directly or via a preset chip ({@link TRADE_UNIT_EXAMPLES}) that fills in
 * the pair and leaves the rate for the shopkeeper to type.
 *
 * There is no delete, matching the backend: a pair's rate is corrected in place, never removed.
 * Editing therefore only reopens the factor — the pair itself is the row's identity.
 */
@Component({
  selector: 'app-settings-units',
  imports: [FormField, NgTemplateOutlet],
  templateUrl: './units.html',
  styleUrls: ['./settings-table.css', './units.css'],
})
export class SettingsUnits {
  protected readonly locale = inject(LocaleService);
  private readonly stores = inject(StoreService);
  private readonly conversions = inject(UnitConversionService);
  private readonly unitApi = inject(UnitService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly rates = this.conversions.rates;

  protected readonly adding = signal(false);
  protected readonly editingId = signal<string | null>(null);
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

  /** Starts from the built-in defaults, replaced by the store's own list once it loads. */
  protected readonly unitSuggestions = signal<readonly string[]>(UNIT_SUGGESTIONS);
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
    void this.load();
    void this.unitApi
      .names()
      .then((names) => this.unitSuggestions.set(names))
      .catch(() => {
        // Non-fatal: the built-in defaults already loaded above still work.
      });
  }

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
    this.editingId.set(null);
    this.errorKey.set(null);
    this.draft.set(preset ? { fromUnit: preset.from, toUnit: preset.to, factor: null } : { ...EMPTY_DRAFT });
    this.adding.set(true);
  }

  startEdit(rate: UnitConversionRate): void {
    this.adding.set(false);
    this.errorKey.set(null);
    this.editingId.set(rate.id);
    this.draft.set({
      fromUnit: rate.fromUnit,
      toUnit: rate.toUnit,
      factor: Number(formatFactor(rate.factor)),
    });
  }

  cancel(): void {
    this.adding.set(false);
    this.editingId.set(null);
    this.errorKey.set(null);
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
      this.cancel();
    } else {
      this.errorKey.set('error.generic');
    }
  }

  protected displayFactor(rate: UnitConversionRate): string {
    return formatFactor(rate.factor);
  }

  startCopy(): void {
    this.cancel();
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
