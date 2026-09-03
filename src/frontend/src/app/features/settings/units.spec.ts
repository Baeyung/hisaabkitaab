import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SettingsUnits } from './units';
import { StoreService } from '../../core/store/store.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { UnitConversionService } from '../../core/units/unit-conversion.service';
import { Unit, UnitService } from '../../core/units/unit.service';
import { UnitConversionDraft, UnitConversionRate } from '../../core/units/unit-conversion.models';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * A rate is keyed by its pair, so correcting the pair — "that 22 was gaz, not metre" — writes
 * a different row than the one being edited. Unless the old one is dropped the shop is left
 * with both, and the wrong one still answers for its pair.
 */
const RATE: UnitConversionRate = { id: 'rate-1', fromUnit: 'metre', toUnit: 'than', factor: 22 };

/** What the store already has when a test starts — the shape UnitService.list() returns. */
const UNITS: Unit[] = [
  { id: 'u-1', name: 'Bori' },
  { id: 'u-2', name: 'Than' },
];

function setup(unitApi: Partial<UnitService> = {}) {
  const taught: UnitConversionDraft[] = [];
  const deleted: string[] = [];
  const rates = signal<UnitConversionRate[]>([RATE]);

  const fakeConversions = {
    rates: rates.asReadonly(),
    load: () => Promise.resolve(),
    // Same shape as the backend: the row that comes back is the one for the pair sent, which
    // is a different id whenever the pair changed.
    teach: (draft: UnitConversionDraft) => {
      taught.push(draft);
      const same = draft.fromUnit === RATE.toUnit && draft.toUnit === RATE.fromUnit;
      return Promise.resolve({ ...draft, id: same ? RATE.id : 'rate-2' } as UnitConversionRate);
    },
    delete: (id: string) => {
      deleted.push(id);
      return Promise.resolve(true);
    },
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: UnitConversionService, useValue: fakeConversions },
      { provide: UnitService, useValue: { list: () => Promise.resolve(UNITS), ...unitApi } },
      { provide: StoreService, useValue: { stores: signal([]), currentId: signal('shop-1') } },
      { provide: LocaleService, useValue: { t: (key: string) => key } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    ],
  });

  const page = TestBed.runInInjectionContext(() => new SettingsUnits());
  return { page, taught, deleted };
}

async function editTo(page: SettingsUnits, fromUnit: string, toUnit: string, factor: number) {
  page.startEdit(RATE);
  page['draft'].set({ fromUnit, toUnit, factor });
  await page.save();
}

describe('SettingsUnits editing a rate', () => {
  it('moves the rate when the pair is corrected, leaving no second row', async () => {
    const { page, taught, deleted } = setup();
    await editTo(page, 'than', 'gaz', 22);

    expect(taught).toEqual([{ fromUnit: 'than', toUnit: 'gaz', factor: 22 }]);
    expect(deleted).toEqual([RATE.id]);
  });

  it('keeps the row when only the number changes', async () => {
    const { page, taught, deleted } = setup();
    await editTo(page, 'than', 'metre', 24);

    expect(taught).toEqual([{ fromUnit: 'than', toUnit: 'metre', factor: 24 }]);
    expect(deleted).toEqual([]);
  });

  it('never deletes anything while adding', async () => {
    const { page, deleted } = setup();
    page.startAdd();
    page['draft'].set({ fromUnit: 'bori', toUnit: 'kilo', factor: 50 });
    await page.save();

    expect(deleted).toEqual([]);
  });
});

/**
 * The New unit token. The list it lands in is alphabetical and the token stays open for the
 * next name, so both have to hold after a save — a shop setting itself up types several in a
 * row and would otherwise find them piling up at the end.
 */
describe('SettingsUnits adding a unit', () => {
  it('files the new name alphabetically and leaves the box ready for the next', async () => {
    const created: string[] = [];
    const { page } = setup({
      create: (name: string) => {
        created.push(name);
        return Promise.resolve({ id: 'u-3', name });
      },
    });
    await Promise.resolve();

    page.startAddUnit();
    page['unitDraft'].set({ name: '  Gaz  ' });
    await page.addUnit();

    expect(created).toEqual(['Gaz']);
    expect(page['units']()?.map((u) => u.name)).toEqual(['Bori', 'Gaz', 'Than']);
    expect(page['addingUnit']()).toBe(true);
    expect(page['unitDraft']().name).toBe('');
  });

  it('says so when the shop already has that name, and adds nothing', async () => {
    const { page } = setup({
      create: () => Promise.reject({ status: 409 }),
    });
    await Promise.resolve();

    page.startAddUnit();
    page['unitDraft'].set({ name: 'bori' });
    await page.addUnit();

    expect(page['unitErrorKey']()).toBe('settings.units.manage.duplicate');
    expect(page['units']()?.map((u) => u.name)).toEqual(['Bori', 'Than']);
  });
});
