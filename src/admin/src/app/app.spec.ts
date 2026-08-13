import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';

import { App } from './app';
import { AdminApi } from './admin-api';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
        // The real SwUpdate is only provided when a service worker is registered,
        // which never happens under test.
        { provide: SwUpdate, useValue: { versionUpdates: EMPTY } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    // The user list fires off its load on construction; nothing here asserts on those requests.
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('shows the login screen when signed out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('app-login')).toBeTruthy();
    expect(page.querySelector('app-users')).toBeFalsy();
  });

  it('shows the user list once credentials are held', async () => {
    TestBed.inject(AdminApi).credentials.set('dGVzdDp0ZXN0');

    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigate(['/users']);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-users')).toBeTruthy();
  });

  it('opens the blocks screen from its own URL', async () => {
    TestBed.inject(AdminApi).credentials.set('dGVzdDp0ZXN0');

    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigate(['/whatsapp-blocks']);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('app-blocks')).toBeTruthy();
    expect(page.querySelector('app-users')).toBeFalsy();
  });
});
