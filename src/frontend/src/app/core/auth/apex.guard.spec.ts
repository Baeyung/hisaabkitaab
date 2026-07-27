import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { apexAppRedirectGuard, apexRedirectGuard } from './apex.guard';
import { environment } from '../../../environments/environment';

const route = {} as ActivatedRouteSnapshot;
const state = (url: string) => ({ url }) as RouterStateSnapshot;

describe('apex guards', () => {
  const original = environment.apexHosts;

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
  afterEach(() => (environment.apexHosts = original));

  // The test host stands in for the apex hostname; listing it flips the guards on.
  const asApex = () => (environment.apexHosts = [location.hostname]);
  const asApp = () => (environment.apexHosts = []);

  it('sends the app shell to /info on an apex host', () => {
    asApex();
    const result = TestBed.runInInjectionContext(() => apexRedirectGuard(route, state('/')));
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/info');
  });

  it('leaves the app shell alone on the app host', () => {
    asApp();
    expect(TestBed.runInInjectionContext(() => apexRedirectGuard(route, state('/')))).toBe(true);
  });

  it('leaves auth routes alone on the app host', () => {
    asApp();
    expect(
      TestBed.runInInjectionContext(() => apexAppRedirectGuard(route, state('/login'))),
    ).toBe(true);
  });
});
