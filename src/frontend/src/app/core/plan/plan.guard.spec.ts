import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { planLimitGuard } from './plan.guard';
import { PlanService, PlanStatus } from './plan.service';
import { StoreService } from '../store/store.service';
import { AuthStore } from '../auth/auth.store';
import { Store, StoreRole } from '../store/store.models';
import { environment } from '../../../environments/environment';

const state = {} as RouterStateSnapshot;

/** A route snapshot carrying (or not carrying) a `:storeId`, as the real ones do. */
const routeFor = (storeId?: string) =>
  ({
    paramMap: convertToParamMap(storeId ? { storeId } : {}),
  }) as ActivatedRouteSnapshot;

const storeWith = (id: string, role: StoreRole): Store => ({
  id,
  name: id,
  address: '',
  contact: '',
  logoUri: '',
  watermarkUri: '',
  role,
  ownerName: 'Someone',
  suspended: false,
});

/** Over its shop ceiling: two open against a plan covering one. */
const overLimit: PlanStatus = {
  tier: 'TRIAL',
  expiresAt: null,
  expired: false,
  enforced: true,
  limits: { maxStores: 1, maxUsers: 1, whatsappQuota: 0 },
  usage: { stores: 2, users: 1 },
};

const withinLimit: PlanStatus = { ...overLimit, usage: { stores: 1, users: 1 } };

/**
 * Who gets sent to the "choose what to keep" screen. The backend refuses the writes either
 * way, so none of this is the boundary — it is the promise that an owner over their plan is
 * shown the way out instead of a screen full of refusals, and that nobody *else* is.
 */
describe('planLimitGuard', () => {
  function configure() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { credentials: signal('creds') } },
      ],
    });
  }

  /** Loads the store list and the plan, as storeGuard and the picker between them would. */
  async function setUp(stores: Store[], plan: PlanStatus) {
    configure();
    const storeService = TestBed.inject(StoreService);
    const planService = TestBed.inject(PlanService);
    const http = TestBed.inject(HttpTestingController);

    const loadedStores = storeService.list();
    http.expectOne(`${environment.apiUrl}/stores`).flush(stores);
    await loadedStores;

    const loadedPlan = planService.load();
    http.expectOne(`${environment.apiUrl}/plan/me`).flush(plan);
    await loadedPlan;
  }

  const run = (storeId?: string) =>
    TestBed.runInInjectionContext(() => planLimitGuard(routeFor(storeId), state));

  const urlOf = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('sends an over-limit owner entering their own shop to the limits screen', async () => {
    await setUp([storeWith('mine', 'OWNER')], overLimit);
    expect(urlOf(await run('mine'))).toBe('/plan/limits');
  });

  it('lets the same owner into a shop shared with them', async () => {
    await setUp([storeWith('mine', 'OWNER'), storeWith('theirs', 'EDITOR')], overLimit);
    // That shop runs on its owner's plan; this user's downgrade is none of its business.
    expect(await run('theirs')).toBe(true);
  });

  /**
   * `stores/new` carries no store, and the guard must not fall back to whichever store was
   * selected last — coming from a shared shop, that would read as "not their work" and wave
   * an over-limit owner into opening another one.
   */
  it('gates opening a new shop even when a shared shop was the last one visited', async () => {
    await setUp([storeWith('mine', 'OWNER'), storeWith('theirs', 'EDITOR')], overLimit);
    TestBed.inject(StoreService).select('theirs');

    expect(urlOf(await run())).toBe('/plan/limits');
  });

  it('lets an owner who is within their plan straight through', async () => {
    await setUp([storeWith('mine', 'OWNER')], withinLimit);
    expect(await run('mine')).toBe(true);
  });

  /** An unknown plan must never lock someone out of their own product. */
  it('lets the user through when the plan cannot be read', async () => {
    configure();
    const http = TestBed.inject(HttpTestingController);

    // The storeless route, which is the one that reaches the plan without a store list.
    const result = run();
    http.expectOne(`${environment.apiUrl}/plan/me`).error(new ProgressEvent('network'));

    expect(await result).toBe(true);
  });

  /**
   * Belt and braces on the same instinct: with no store list to say whose shop this is,
   * the guard lets the request past rather than guessing. `storeGuard` runs first on every
   * store route and loads it, so this is the state that should not happen — and if it ever
   * does, being wrong in the direction of a working app is the one to be wrong in.
   */
  it('lets a store route through when the store list has not loaded', async () => {
    configure();
    expect(await run('mine')).toBe(true);
    TestBed.inject(HttpTestingController).expectNone(`${environment.apiUrl}/plan/me`);
  });
});
