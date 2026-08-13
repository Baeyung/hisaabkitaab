import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { editorGuard, managerGuard, ownerGuard } from './store.guard';
import { StoreService } from './store.service';
import { AuthStore } from '../auth/auth.store';
import { Store, StoreRole } from './store.models';
import { NAV, navFor } from '../../layout/shell/nav';
import { environment } from '../../../environments/environment';

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

const storeWith = (role: StoreRole, suspended = false): Store => ({
  id: 'shop-1',
  name: 'Rana Cloth',
  address: '',
  contact: '',
  logoUri: '',
  watermarkUri: '',
  role,
  ownerName: 'Rana',
  suspended,
  // A shop nobody has arranged: the built-in menu, nothing hidden.
  settings: { menu: [], hideChrome: [] },
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
  async function enter(role: StoreRole, suspended = false) {
    const stores = configure();
    const loaded = stores.list();
    TestBed.inject(HttpTestingController)
      .expectOne(`${environment.apiUrl}/stores`)
      .flush([storeWith(role, suspended)]);
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

  /**
   * A shop the plan has closed is read-only for everyone in it, its owner included — but it
   * is still theirs. `isOwner` staying true is what leaves them the settings screens they
   * need to delete it or free a seat; `canEdit` going false is what every write route is
   * already behind, so they all refuse without knowing a plan exists.
   */
  it('closes a suspended shop to writing without taking it away from its owner', async () => {
    const owner = await enter('OWNER', true);
    expect(owner.canEdit()).toBe(false);
    expect(owner.isOwner()).toBe(true);
    // The screen holding the delete button, which the backend allows on a closed shop
    // (`@CurrentStore(allowLocked = true)`) — so this must not be gated on canEdit.
    expect(owner.canManage()).toBe(true);

    expect((await enter('EDITOR', true)).canEdit()).toBe(false);
  });

  it('keeps the shop settings reachable in a closed shop', async () => {
    await enter('OWNER', true);
    expect(TestBed.runInInjectionContext(() => managerGuard(route, state))).toBe(true);
  });

  it('keeps the shop settings from a viewer, closed or not', async () => {
    await enter('VIEWER', true);
    const refused = TestBed.runInInjectionContext(() => managerGuard(route, state));
    expect(TestBed.inject(Router).serializeUrl(refused as UrlTree)).toBe('/s/shop-1/dashboard');
  });

  it('sends an editor typing an entry URL into a closed shop back to the dashboard', async () => {
    await enter('EDITOR', true);
    const result = TestBed.runInInjectionContext(() => editorGuard(route, state));
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/s/shop-1/dashboard');
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

    it('offers a viewer nothing that writes in the shop', () => {
      const seen = paths('VIEWER');
      expect(seen).toContain('dashboard');
      expect(seen).toContain('ledger');
      expect(seen.some((p) => p.startsWith('new-entry'))).toBe(false);
      // Their own account is the one thing they may change, and it lives here.
      expect(seen.filter((p) => p.startsWith('settings'))).toEqual(['settings/users']);
    });

    it('offers an editor the entry screens but not the shop itself', () => {
      const seen = paths('EDITOR');
      expect(seen).toContain('new-entry/sale');
      expect(seen).toContain('settings/items');
      // General is in: the opening drawer balance on it is theirs to set.
      expect(seen).toContain('settings/general');
      // In for their own account; the shop's people are gated inside the screen.
      expect(seen).toContain('settings/users');
    });

    it('offers the owner everything', () => {
      expect(paths('OWNER')).toContain('settings/users');
    });

    /**
     * The shell only checks `writes` on groups and sub-items — a top-level link carrying it
     * would be offered as usable in a closed shop and then bounce off `editorGuard`, which is
     * the exact thing greying these out exists to stop. Kept here so adding one fails loudly.
     */
    it('keeps every top-level link a read screen', () => {
      expect(NAV.filter((item) => item.kind === 'link' && item.writes)).toEqual([]);
    });

    it('marks what a closed shop refuses, and nothing else', () => {
      const settings = NAV.find((item) => item.key === 'nav.settings');
      const marked = settings?.kind === 'group' ? settings.children.filter((c) => c.writes) : [];
      expect(marked.map((c) => c.path)).toEqual(['settings/items', 'settings/party']);
      // The way out of a closed shop — deleting it, or freeing a seat — stays open.
      expect(marked.map((c) => c.path)).not.toContain('settings/general');
      expect(NAV.some((item) => item.key === 'nav.newEntry' && item.writes)).toBe(true);
    });

    it('drops a group once every child is above the role', () => {
      expect(navFor('VIEWER').some((item) => item.kind === 'group' && item.key === 'nav.newEntry')).toBe(
        false,
      );
    });
  });
});
