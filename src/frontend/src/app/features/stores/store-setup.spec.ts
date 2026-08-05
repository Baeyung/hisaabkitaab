import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { StoreSetup } from './store-setup';
import { StoreService } from '../../core/store/store.service';
import { StoreItemService } from '../../core/store/store-item.service';
import { PartyService } from '../../core/store/party.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { Store } from '../../core/store/store.models';

/**
 * Which section opens is the whole wizard: read it from the selected store rather
 * than from the URL and a shopkeeper adding a *second* shop lands on the goods
 * section of the shop they were already in — create form skipped, new items
 * written into the wrong books.
 */
const SHOP = { id: 'shop-1', name: 'Ahmad Cloth House' } as Store;

function setup(routeStoreId: string | null, itemApi: Partial<StoreItemService> = {}): StoreSetup {
  // A shop is already selected either way — the user reached both routes from one.
  const fakeStores = {
    stores: signal([SHOP]),
    currentId: signal(SHOP.id),
    current: signal(SHOP),
    api: (path: string) => `/api/stores/${SHOP.id}/${path}`,
  };
  const noRows = { list: () => Promise.resolve([]) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: StoreService, useValue: fakeStores },
      { provide: StoreItemService, useValue: { ...noRows, ...itemApi } },
      { provide: PartyService, useValue: noRows },
      // Nothing is rendered here, and the real one reads localStorage on construction.
      { provide: LocaleService, useValue: { t: (key: string) => key } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => routeStoreId } } },
      },
    ],
  });
  return TestBed.runInInjectionContext(() => new StoreSetup());
}

describe('StoreSetup opening section', () => {
  it('opens the create form when the route carries no store', () => {
    const page = setup(null);
    expect(page['step']()).toBe('shop');
    expect(page['locked']('shop')).toBe(false);
  });

  it('opens the goods section when the route names the store being set up', () => {
    const page = setup(SHOP.id);
    expect(page['step']()).toBe('goods');
    expect(page['locked']('shop')).toBe(true);
  });
});

/**
 * Leaving a section used to drop whatever was typed into the add row but never
 * added — the one place this screen could lose a shopkeeper's work, and the
 * easiest mistake to make, since "Next" sits right below the row.
 */
describe('StoreSetup leaving a section with a half-typed row', () => {
  it('writes the typed row before moving on', async () => {
    const created: string[] = [];
    const page = setup(SHOP.id, {
      create: (draft) => {
        created.push(draft.name);
        return Promise.resolve({ id: 'i1', ...draft, openingStock: null });
      },
    });
    page['itemRow'].set({ name: '  Khaddar  ', unit: 'Meter', salePrice: 760, costPrice: null, openingStock: null, service: false });

    await page.goTo('khatas');

    expect(created).toEqual(['Khaddar']);
    expect(page['items']().map((i) => i.name)).toEqual(['Khaddar']);
    expect(page['step']()).toBe('khatas');
  });

  it('stays put when that write fails, so the error is on the section it belongs to', async () => {
    const page = setup(SHOP.id, { create: () => Promise.reject(new Error('offline')) });
    page['itemRow'].set({ name: 'Khaddar', unit: '', salePrice: null, costPrice: null, openingStock: null, service: false });

    await page.goTo('khatas');

    expect(page['step']()).toBe('goods');
    expect(page['errorKey']()).toBe('error.generic');
  });

  it('moves on untouched when the add row is empty', async () => {
    const page = setup(SHOP.id, {
      create: () => Promise.reject(new Error('should not be called')),
    });

    await page.goTo('khatas');

    expect(page['step']()).toBe('khatas');
  });
});
