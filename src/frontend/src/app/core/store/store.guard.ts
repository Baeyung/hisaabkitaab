import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StoreService } from './store.service';

/**
 * Resolves the `:storeId` in the URL into the current store, refusing anything that
 * isn't one of the user's own — a stale bookmark, a hand-typed id, or a link from
 * someone else's shop all land back on the picker instead of firing a screen full
 * of 404s. (The backend refuses them too; this is so the user sees a way forward.)
 *
 * Loads the store list when it hasn't been fetched yet, which makes this the single
 * loader for store routes: deep links and refreshes resolve correctly instead of
 * racing an in-flight fetch.
 */
export const storeGuard: CanActivateFn = async (route) => {
  const stores = inject(StoreService);
  const router = inject(Router);
  const picker = router.createUrlTree(['/stores']);

  const storeId = route.paramMap.get('storeId');
  if (!storeId) {
    return picker;
  }

  if (stores.stores() === null) {
    try {
      await stores.list();
    } catch {
      return picker;
    }
  }

  if (!stores.stores()?.some((s) => s.id === storeId)) {
    return picker;
  }

  stores.select(storeId);
  return true;
};
