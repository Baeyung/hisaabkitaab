import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { copyTargets } from './copy-to-stores';
import { Store, StoreSettings } from '../../core/store/store.models';
import { StoreService } from '../../core/store/store.service';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/stores`;

function store(id: string, over: Partial<Store> = {}): Store {
  return {
    id,
    name: id,
    address: '',
    contact: '',
    logoUri: '',
    watermarkUri: '',
    role: 'OWNER',
    ownerName: 'me',
    suspended: false,
    settings: { menu: [], hideChrome: [] },
    ...over,
  };
}

/** Let the copy's own awaits run between the two calls it makes. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Seed the service's cache the way the app does — through the list call. */
function setup(stores: Store[], currentId = 'a') {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(StoreService);
  const http = TestBed.inject(HttpTestingController);
  const listed = service.list();
  http.expectOne(API).flush(stores);
  service.select(currentId);
  return { service, http, listed };
}

describe('copyTargets', () => {
  it('offers editable open shops for a data copy, and owned shops for an arrangement', async () => {
    const { service, http, listed } = setup([
      store('a'),
      store('b', { role: 'EDITOR' }),
      store('c', { role: 'VIEWER' }),
      store('d', { suspended: true }),
    ]);
    await listed;

    // Not this one, not one this user only reads, not one the plan has closed.
    expect(copyTargets(service).map((s) => s.id)).toEqual(['b']);
    // An arrangement goes through owner-only PUT /settings, which a closed shop still accepts.
    expect(copyTargets(service, true).map((s) => s.id)).toEqual(['d']);

    http.verify();
  });
});

describe('StoreService.copySettingsTo', () => {
  it('patches the target shop’s own settings rather than this one’s', async () => {
    const { service, http, listed } = setup([store('a'), store('b')]);
    await listed;

    // What the cache holds for b is deliberately not what b actually has: a copy that wrote
    // the stale document would take the target's reports and menu down with it.
    const fresh: StoreSettings = {
      menu: [{ key: 'nav.ledger', hidden: true }],
      hideChrome: ['THEME'],
      reports: {
        dailyEnabled: true,
        dailyTime: '21:00',
        reminderEnabled: false,
        reminderDay: 1,
        reminderTime: '10:00',
        reminderMinAmount: 0,
        reminderMinDaysStale: 30,
      },
    };

    const done = service.copySettingsTo(['b'], (target) => ({ ...target, easyMode: true }));

    http.expectOne(`${API}/b`).flush(store('b', { settings: fresh }));
    await tick();
    const put = http.expectOne(`${API}/b/settings`);
    expect(put.request.body).toEqual({ ...fresh, easyMode: true });
    put.flush(store('b', { settings: { ...fresh, easyMode: true } }));

    expect(await done).toEqual([]);
    http.verify();
  });

  it('reports the shops it could not finish', async () => {
    const { service, http, listed } = setup([store('a'), store('b')]);
    await listed;

    const done = service.copySettingsTo(['b'], (target) => target);
    http.expectOne(`${API}/b`).flush('nope', { status: 500, statusText: 'Server Error' });

    expect(await done).toEqual(['b']);
    http.verify();
  });
});
