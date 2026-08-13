import { Routes } from '@angular/router';

import { Blocks } from './blocks';
import { Users } from './users';

/**
 * Two screens, so the router that {@code app.html} always said would arrive when a second one
 * did. No guard: signing in is not a route here — {@code App} shows the login instead of the
 * frame while there are no credentials, so nothing behind this is reachable signed out.
 *
 * Both are eager. The whole back office is smaller than one lazy chunk's worth of ceremony.
 */
export const routes: Routes = [
  { path: 'users', component: Users },
  { path: 'whatsapp-blocks', component: Blocks },
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  { path: '**', redirectTo: 'users' },
];
