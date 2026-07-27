import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';

// Same bundle serves the marketing hostnames and the app hostname; only the
// hostname tells them apart, and it's only readable client-side.
const isApex = () => environment.apexHosts.includes(location.hostname);

/** Apex/www: the app shell isn't for this hostname — show the landing page. */
export const apexRedirectGuard: CanActivateFn = () =>
  isApex() ? inject(Router).createUrlTree(['/info']) : true;

/** Apex/www: auth screens live on the app subdomain — hand off cross-origin. */
export const apexAppRedirectGuard: CanActivateFn = (_route, state) => {
  if (!isApex()) return true;
  location.href = environment.appOrigin + state.url;
  return false;
};
