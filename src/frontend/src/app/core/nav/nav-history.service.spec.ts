import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationStart,
  Router,
} from '@angular/router';
import { Subject } from 'rxjs';
import { NavHistoryService } from './nav-history.service';

/**
 * The two chevrons grey out at the ends of the run of history entries this app has put on
 * the stack, and nothing in the browser will say where those ends are — so the service counts
 * for itself off the router's own events. These are those event sequences, replayed: an
 * arrival, a push, a Back, a Forward, a tab switch that rewrites the URL in place, and a guard
 * redirect that cancels one navigation and starts another.
 */
describe('NavHistoryService', () => {
  const events = new Subject<NavigationStart | NavigationEnd | NavigationCancel>();
  let replaceUrl = false;
  const location = { back: vi.fn(), forward: vi.fn() };

  let nav: NavHistoryService;
  let id = 0;

  /** One navigation, start to finish. `restored` is the id of the entry a popstate returns to. */
  function navigate(options: { restored?: number; replace?: boolean } = {}): number {
    const at = ++id;
    replaceUrl = options.replace === true;
    events.next(
      new NavigationStart(
        at,
        '/s/1/x',
        options.restored === undefined ? 'imperative' : 'popstate',
        options.restored === undefined ? null : { navigationId: options.restored },
      ),
    );
    events.next(new NavigationEnd(at, '/s/1/x', '/s/1/x'));
    replaceUrl = false;
    return at;
  }

  /** A guard sending the navigation somewhere else: it cancels, and a second one lands. */
  function redirect(): void {
    const at = ++id;
    events.next(new NavigationStart(at, '/s/1/x', 'imperative', null));
    events.next(
      new NavigationCancel(at, '/s/1/x', '', NavigationCancellationCode.SupersededByNewNavigation),
    );
  }

  beforeEach(() => {
    id = 0;
    location.back.mockClear();
    location.forward.mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            events,
            getCurrentNavigation: () => ({ extras: { replaceUrl } }),
          },
        },
        { provide: Location, useValue: location },
      ],
    });
    nav = TestBed.inject(NavHistoryService);
  });

  it('offers neither direction on the first screen of the session', () => {
    navigate();
    expect(nav.canBack()).toBe(false);
    expect(nav.canForward()).toBe(false);
  });

  it('offers Back once a second screen has been opened, and Forward only after going back', () => {
    const first = navigate();
    const second = navigate();
    expect(nav.canBack()).toBe(true);
    expect(nav.canForward()).toBe(false);

    navigate({ restored: first });
    expect(nav.canBack()).toBe(false);
    expect(nav.canForward()).toBe(true);

    navigate({ restored: second });
    expect(nav.canBack()).toBe(true);
    expect(nav.canForward()).toBe(false);
  });

  it('drops what was ahead when a new screen is opened from partway back', () => {
    const first = navigate();
    navigate();
    navigate({ restored: first });
    expect(nav.canForward()).toBe(true);

    navigate();
    expect(nav.canForward()).toBe(false);
    expect(nav.canBack()).toBe(true);
  });

  // The board switches tabs this way, and guards rewrite URLs this way: one entry, a
  // different address on it. Counting those would put Back presses between a shopkeeper and
  // the screen they actually came from.
  it('does not count a navigation that rewrites the current entry', () => {
    navigate();
    navigate({ replace: true });
    navigate({ replace: true });
    expect(nav.canBack()).toBe(false);
  });

  it('does not count a navigation a guard cancelled', () => {
    navigate();
    redirect();
    expect(nav.canBack()).toBe(false);

    navigate();
    expect(nav.canBack()).toBe(true);
  });

  it('moves the browser only when there is somewhere to move to', () => {
    navigate();
    nav.back();
    nav.forward();
    expect(location.back).not.toHaveBeenCalled();
    expect(location.forward).not.toHaveBeenCalled();

    navigate();
    nav.back();
    expect(location.back).toHaveBeenCalledOnce();
  });
});
