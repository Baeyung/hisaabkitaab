import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlanService } from './plan.service';
import { StoreService } from '../store/store.service';

/**
 * Sends an account that is using more than its plan covers to the screen where it decides
 * what to keep, and lets everyone else through.
 *
 * Only the user's *own* work is gated. A shop shared with them runs on its own owner's plan,
 * so it stays reachable — shutting someone out of a paying owner's shop over an unrelated
 * account's downgrade is the same mistake `isLoginAllowed` already avoids at the door. That
 * is why this runs *after* `storeGuard` on the store routes: it is what loads the store list
 * this reads the ownership out of, and a guard that ran first would gate both alike.
 *
 * The plan is fetched when it hasn't been read yet, so a deep link or a refresh lands here
 * correctly rather than racing the picker's own load. A failed fetch lets the user through —
 * an unknown plan must never lock someone out of their own product, and the backend refuses
 * the writes regardless.
 */
export const planLimitGuard: CanActivateFn = async (route) => {
  const plan = inject(PlanService);
  const stores = inject(StoreService);
  const router = inject(Router);

  // Whose shop this is, read off the route rather than `StoreService.role()`. That signal
  // is the *last* store selected, and `stores/new` carries no store at all — so a user
  // coming from a shop shared with them would be judged on that shop's role and waved
  // through. Absent id means a route that is always the user's own work, so it is gated.
  const storeId = route.paramMap.get('storeId');
  if (storeId !== null && !stores.stores()?.some((s) => s.id === storeId && s.role === 'OWNER')) {
    return true;
  }

  try {
    await plan.load();
  } catch {
    return true;
  }

  return plan.overLimit() ? router.createUrlTree(['/plan/limits']) : true;
};
