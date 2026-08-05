import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { AdminApi } from './admin-api';

describe('App', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-users')).toBeTruthy();
  });
});
