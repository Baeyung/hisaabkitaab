import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { SettingsGeneral } from './general';
import { StoreService } from '../../core/store/store.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { Store } from '../../core/store/store.models';

/**
 * Deleting a shop takes its khatas, items and every transaction with it, with no
 * undo — so the gate is the whole feature. It has to hold against a near-miss
 * (wrong case, stray space) and against a confirm that never went through the
 * button at all, since the dialog's form also submits on Enter.
 */
const SHOP = { id: 'shop-1', name: 'Ahmad Cloth House' } as Store;

function setup() {
  const deleted: string[] = [];
  const navigated: unknown[][] = [];
  const fakeStores = {
    current: signal<Store | null>(SHOP),
    getOpeningCash: () => Promise.resolve(0),
    delete: (id: string) => {
      deleted.push(id);
      return Promise.resolve();
    },
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: StoreService, useValue: fakeStores },
      // Nothing is rendered here, and the real one reads localStorage on construction.
      { provide: LocaleService, useValue: { t: (key: string) => key } },
      {
        provide: Router,
        useValue: {
          navigate: (commands: unknown[]) => {
            navigated.push(commands);
            return Promise.resolve(true);
          },
        },
      },
    ],
  });

  const page = TestBed.runInInjectionContext(() => new SettingsGeneral());
  return { page, deleted, navigated };
}

describe('SettingsGeneral delete store', () => {
  it('only unlocks on the store name typed exactly', () => {
    const { page } = setup();

    for (const near of ['', 'ahmad cloth house', 'Ahmad Cloth House ', 'Ahmad']) {
      page['typedName'].set(near);
      expect(page['canDelete']()).toBe(false);
    }

    page['typedName'].set('Ahmad Cloth House');
    expect(page['canDelete']()).toBe(true);
  });

  it('refuses to delete when the typed name does not match', async () => {
    const { page, deleted, navigated } = setup();
    page['typedName'].set('ahmad cloth house');

    await page.confirmDelete();

    expect(deleted).toEqual([]);
    expect(navigated).toEqual([]);
  });

  it('deletes the store and leaves the store route once confirmed', async () => {
    const { page, deleted, navigated } = setup();
    page['typedName'].set(SHOP.name);

    await page.confirmDelete();

    expect(deleted).toEqual([SHOP.id]);
    expect(navigated).toEqual([['/stores']]);
  });
});
