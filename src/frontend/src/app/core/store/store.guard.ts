import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StoreService } from './store.service';

/**
 * Gates the app on the user having set up a store. Settings › General sits
 * outside this guard (see app.routes.ts) so there is somewhere to create one.
 *
 * Loads the stores when they haven't been fetched yet, which makes this the
 * single loader for guarded routes — deep links and refreshes resolve correctly
 * instead of racing an in-flight fetch. A failure sends the user to the store
 * page rather than through: the same safe default the nav lock takes.
 */
export const storeGuard: CanActivateFn = async () => {
  const stores = inject(StoreService);
  const router = inject(Router);
  const storePage = router.createUrlTree(['/settings/general']);

  if (stores.stores() === null) {
    try {
      await stores.list();
    } catch {
      return storePage;
    }
  }
  return stores.hasStore() ? true : storePage;
};
