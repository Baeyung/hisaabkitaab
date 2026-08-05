import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { editorGuard, ownerGuard } from './store.guard';
import { StoreService } from './store.service';
import { AuthStore } from '../auth/auth.store';
import { Store, StoreRole } from './store.models';
import { navFor } from '../../layout/shell/nav';
import { environment } from '../../../environments/environment';

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

const storeWith = (role: StoreRole): Store => ({
  id: 'shop-1',
  name: 'Rana Cloth',
  address: '',
  contact: '',
  logoUri: '',
  watermarkUri: '',
  role,
  ownerName: 'Rana',
});

/**
 * What each role may reach. The backend refuses the same calls, so none of this is the
 * security boundary — it is the promise that a shared user is never offered a control
 * that would fail, and never lands on a screen they cannot use.
 */
describe('store roles', () => {
  function configure() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // The real one reads localStorage on construction. Credentials must be present:
        // StoreService drops its cache the moment they go away.
        { provide: AuthStore, useValue: { credentials: signal('creds') } },
      ],
    });
    return TestBed.inject(StoreService);
  }

  /** Loads one store at `role` over the wire and enters it, as storeGuard would. */
  async function enter(role: StoreRole) {
    const stores = configure();
    const loaded = stores.list();
    TestBed.inject(HttpTestingController)
      .expectOne(`${environment.apiUrl}/stores`)
      .flush([storeWith(role)]);
    await loaded;
    stores.select('shop-1');
    return stores;
  }

  it('reads the role off the store being viewed', async () => {
    expect((await enter('VIEWER')).canEdit()).toBe(false);
    expect((await enter('EDITOR')).canEdit()).toBe(true);
    expect((await enter('OWNER')).canEdit()).toBe(true);
    expect((await enter('EDITOR')).isOwner()).toBe(false);
    expect((await enter('OWNER')).isOwner()).toBe(true);
  });

  it('has no role outside a store route', () => {
    const stores = configure();
    expect(stores.role()).toBeNull();
    expect(stores.canEdit()).toBe(false);
    expect(stores.isOwner()).toBe(false);
  });

  it('sends a viewer typing an entry URL back to the dashboard', async () => {
    await enter('VIEWER');
    const result = TestBed.runInInjectionContext(() => editorGuard(route, state));
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/s/shop-1/dashboard');
  });

  it('lets an editor through editorGuard but not ownerGuard', async () => {
    await enter('EDITOR');
    expect(TestBed.runInInjectionContext(() => editorGuard(route, state))).toBe(true);

    const refused = TestBed.runInInjectionContext(() => ownerGuard(route, state));
    expect(TestBed.inject(Router).serializeUrl(refused as UrlTree)).toBe('/s/shop-1/dashboard');
  });

  it('lets the owner through both', async () => {
    await enter('OWNER');
    expect(TestBed.runInInjectionContext(() => editorGuard(route, state))).toBe(true);
    expect(TestBed.runInInjectionContext(() => ownerGuard(route, state))).toBe(true);
  });

  describe('the menu', () => {
    const paths = (role: StoreRole | null) =>
      navFor(role).flatMap((item) => (item.kind === 'link' ? [item.path] : item.children.map((c) => c.path)));

    it('offers a viewer nothing that writes', () => {
      const seen = paths('VIEWER');
      expect(seen).toContain('dashboard');
      expect(seen).toContain('ledger');
      expect(seen.some((p) => p.startsWith('new-entry'))).toBe(false);
      expect(seen.some((p) => p.startsWith('settings'))).toBe(false);
    });

    it('offers an editor the entry screens but not the shop itself', () => {
      const seen = paths('EDITOR');
      expect(seen).toContain('new-entry/sale');
      expect(seen).toContain('settings/items');
      // General is in: the opening drawer balance on it is theirs to set.
      expect(seen).toContain('settings/general');
      expect(seen).not.toContain('settings/users');
    });

    it('offers the owner everything', () => {
      expect(paths('OWNER')).toContain('settings/users');
    });

    it('drops a group once every child is above the role', () => {
      expect(navFor('VIEWER').some((item) => item.kind === 'group' && item.key === 'nav.settings')).toBe(
        false,
      );
    });
  });
});
