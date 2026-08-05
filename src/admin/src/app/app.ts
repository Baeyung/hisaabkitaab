import { Component, computed, inject } from '@angular/core';

import { AdminApi } from './admin-api';
import { Login } from './login';
import { Users } from './users';

/**
 * Two screens and no router: signed out you get the login, signed in you get the back office
 * frame with its menu. There is one destination in that menu, so there is no URL worth owning
 * yet — the router goes in when a second screen does.
 */
@Component({
  selector: 'app-root',
  imports: [Login, Users],
  templateUrl: './app.html',
})
export class App {
  protected readonly api = inject(AdminApi);

  /** Whoever is signed in, read back out of the basic-auth token the API holds. */
  protected readonly admin = computed(() => {
    const token = this.api.credentials();
    if (!token) {
      return '';
    }
    const bytes = Uint8Array.from(atob(token), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes).split(':')[0];
  });

  protected signOut(): void {
    this.api.signOut();
  }
}
