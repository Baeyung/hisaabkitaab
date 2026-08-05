import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { urlFilters } from './url-filters';

/**
 * The whole point of putting filters in the URL is the Back button, so that is
 * what these check: a change is a history entry, Back undoes it, and a link
 * carrying params opens on the view it names.
 */
@Component({ template: '' })
class Host {
  readonly filters = urlFilters({ from: '2026-01-01', to: '2026-01-31', q: '' });
}

/** Router navigation is a promise, not a zone task — let it land, then render. */
async function settle(harness: RouterTestingHarness) {
  await new Promise((resolve) => setTimeout(resolve));
  harness.detectChanges();
}

async function open(url: string) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'report', component: Host }]), provideLocationMocks()],
  });
  const harness = await RouterTestingHarness.create(url);
  // The harness navigates but doesn't listen for popstate — without this,
  // location.back() moves the URL and the router never notices.
  TestBed.inject(Router).setUpLocationChangeListener();
  return {
    host: harness.routeDebugElement!.componentInstance as Host,
    location: TestBed.inject(Location) as Location,
    harness,
  };
}

describe('urlFilters', () => {
  it('reads a filter the URL names and defaults the rest', async () => {
    const { host } = await open('/report?from=2026-03-05');
    expect(host.filters.from()).toBe('2026-03-05');
    expect(host.filters.to()).toBe('2026-01-31');
  });

  it('writes a change into the URL, leaving other params alone', async () => {
    const { host, location, harness } = await open('/report?new=1');
    host.filters.set('from', '2026-03-05');
    await settle(harness);
    expect(location.path()).toContain('from=2026-03-05');
    expect(location.path()).toContain('new=1');
  });

  it('steps back to the range that was showing before', async () => {
    const { host, location, harness } = await open('/report');
    host.filters.set('from', '2026-03-05');
    await settle(harness);
    host.filters.set('from', '2026-04-09');
    await settle(harness);

    location.back();
    await settle(harness);
    expect(host.filters.from()).toBe('2026-03-05');

    location.back();
    await settle(harness);
    expect(host.filters.from()).toBe('2026-01-01');
  });

  it('drops a filter back at its default out of the URL', async () => {
    const { host, location, harness } = await open('/report');
    host.filters.set('from', '2026-03-05');
    await settle(harness);
    host.filters.set('from', '2026-01-01');
    await settle(harness);
    expect(location.path()).not.toContain('from=');
  });

  it('replaces instead of pushing, so Back skips a change nobody chose', async () => {
    const { host, location, harness } = await open('/report');
    host.filters.set('from', '2026-03-05');
    await settle(harness);
    host.filters.replace({ q: 'ahm' });
    await settle(harness);
    expect(host.filters.q()).toBe('ahm');

    location.back();
    await settle(harness);
    // The typed query went onto the same entry as the range, so one Back leaves both.
    expect(host.filters.from()).toBe('2026-01-01');
    expect(host.filters.q()).toBe('');
  });
});
