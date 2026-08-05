import { Component, inject } from '@angular/core';

import { AdminApi } from './admin-api';
import { Login } from './login';
import { Users } from './users';

/**
 * Two screens and no router: signed out you get the login, signed in you get the user list.
 * There is nowhere else to navigate to, so there is no URL worth owning.
 */
@Component({
  selector: 'app-root',
  imports: [Login, Users],
  templateUrl: './app.html',
})
export class App {
  protected readonly api = inject(AdminApi);
}
