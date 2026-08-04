import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // The real SwUpdate is only provided when a service worker is registered,
      // which never happens under test.
      providers: [{ provide: SwUpdate, useValue: { versionUpdates: EMPTY } }],
    }).compileComponents();
  });

  it('should create the app', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });
});
