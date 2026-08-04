import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { StoreSetup } from './store-setup';
import { StoreService } from '../../core/store/store.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { Store } from '../../core/store/store.models';

/**
 * Which section opens is the whole wizard: read it from the selected store rather
 * than from the URL and a shopkeeper adding a *second* shop lands on the goods
 * section of the shop they were already in — create form skipped, new items
 * written into the wrong books.
 */
const SHOP = { id: 'shop-1', name: 'Ahmad Cloth House' } as Store;

function setup(routeStoreId: string | null): StoreSetup {
  // A shop is already selected either way — the user reached both routes from one.
  const fakeStores = {
    stores: signal([SHOP]),
    currentId: signal(SHOP.id),
    current: signal(SHOP),
    api: (path: string) => `/api/stores/${SHOP.id}/${path}`,
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: StoreService, useValue: fakeStores },
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
