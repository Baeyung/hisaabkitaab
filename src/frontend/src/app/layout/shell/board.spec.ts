import { TranslationKey } from '../../core/i18n/translations/en';
import { MenuSetting } from '../../core/store/store.models';
import { BoardTab, BoardTile, EASY_NAV, boardFor, openSheet } from './board';
import { StoreRole } from '../../core/store/store.models';
import { NAV, NavItem, arranged, height } from './nav';

const at = (key: string, extra: Partial<MenuSetting> = {}): MenuSetting => ({ key, ...extra });

/** The board this shop and this role get: the easy-mode document, its table, its depth. */
const board = (saved?: MenuSetting[], role: StoreRole = 'OWNER'): BoardTab[] =>
  boardFor(arranged(role, saved, EASY_NAV, 3));

const tiles = (tabs: readonly BoardTab[]): BoardTile[] =>
  tabs.flatMap((tab) => tab.bands.flatMap((band) => band.tiles));

const keys = (tabs: readonly BoardTab[]) => tiles(tabs).map((tile) => tile.key);

const tabKeys = (tabs: readonly BoardTab[]) => tabs.map((tab) => tab.key);

/** Whether every row in a menu stands within a surface that draws `max` levels. */
const fits = (items: readonly NavItem[], depth: number, max: number): boolean =>
  items.every(
    (item) =>
      depth + height(item) <= max && (item.kind === 'link' || fits(item.children, depth + 1, max)),
  );

/** Every menu entry that has a screen behind it, groups flattened away. */
const leaves = (items: readonly NavItem[]): string[] =>
  items.flatMap((item) => (item.kind === 'link' ? [item.key] : leaves(item.children)));

/**
 * The board an owner arranges: its own document and its own shipped table, three levels deep.
 * What matters here is that it stays a *view of the same app* — nothing appears on it that a
 * role cannot reach, nothing the app has falls off it, and every shape a menu can take that a
 * board cannot is answered rather than dropped.
 */
describe('boardFor', () => {
  it('lays out every screen an owner can reach', () => {
    // Nothing lost between the app's menu and its board — the whole point of building one
    // from the other rather than writing the buttons out by hand.
    expect(keys(board()).sort()).toEqual(leaves(NAV).sort());
  });

  it('ships a board that names every screen exactly once', () => {
    // The other direction, checked on the table rather than on a rendering of it: a screen
    // named twice would be two buttons opening one thing, and one named by no band at all
    // has to have been caught by the overflow tab.
    expect(leaves(EASY_NAV).sort()).toEqual(leaves(NAV).sort());
    expect(new Set(leaves(EASY_NAV)).size).toBe(leaves(EASY_NAV).length);
  });

  it('files a screen no shipped band claims onto the overflow tab', () => {
    // Reports is on the menu and on no band above, so this is the live case, not a contrived
    // one: a screen added without touching the board table still has a button.
    const more = board().find((tab) => tab.key === 'board.tab.more');

    expect(more).toBeDefined();
    expect(keys([more!])).toContain('nav.settings.reports');
  });

  it('numbers the buttons within each tab, restarting on the next one', () => {
    for (const tab of board()) {
      const digits = tab.bands.flatMap((band) => band.tiles.map((tile) => tile.digit));
      expect(digits).toEqual(digits.map((_, i) => (i < 9 ? i + 1 : 0)));
    }
  });

  it('offers a viewer nothing their role does not reach', () => {
    const seen = board(undefined, 'VIEWER');

    // The whole New Entry group is above a viewer's rank, so the Entry tab has nothing to
    // hold and goes with it rather than standing empty.
    expect(keys(seen)).not.toContain('nav.sale');
    expect(tabKeys(seen)).not.toContain('board.tab.entry');
    expect(keys(seen)).toContain('nav.cashbook');
  });

  it('leaves out what the shop hid, wherever it sits', () => {
    const seen = board([
      at('board.tab.reports', {
        children: [at('board.band.goods', { children: [at('nav.inventory', { hidden: true })] })],
      }),
    ]);

    expect(keys(seen)).not.toContain('nav.inventory');
  });

  it("uses the shop's own name for a button, a band and a tab", () => {
    const seen = board([
      at('board.tab.reports', {
        label: 'Books',
        children: [
          at('board.band.books', {
            label: 'Daily',
            children: [at('nav.ledger', { label: 'Khata' })],
          }),
        ],
      }),
    ]);

    const reports = seen.find((tab) => tab.key === 'board.tab.reports');
    expect(reports?.label).toBe('Books');
    expect(reports?.bands[0].label).toBe('Daily');
    expect(tiles(seen).find((tile) => tile.key === 'nav.ledger')?.label).toBe('Khata');
  });

  it('carries a group\'s "writes" down to the buttons the board flattens', () => {
    // `writes` is set on NAV's New Entry group, not on its six screens. A tile that dropped it
    // on the way onto a band would come out of a closed shop looking usable and refuse on save.
    expect(tiles(board()).find((tile) => tile.key === 'nav.sale')?.writes).toBe(true);
    expect(tiles(board()).find((tile) => tile.key === 'nav.cashbook')?.writes).toBeUndefined();
  });

  it('drops a band that has nothing left in it', () => {
    const seen = board([
      at('board.tab.entry', {
        children: [
          at('board.band.moneyIn', { children: [at('nav.sale'), at('nav.receipt')] }),
          at('board.band.moneyOut', {
            children: [
              at('nav.purchase', { hidden: true }),
              at('nav.expense', { hidden: true }),
              at('nav.payment', { hidden: true }),
            ],
          }),
        ],
      }),
    ]);

    const bands = seen.find((tab) => tab.key === 'board.tab.entry')?.bands ?? [];
    // Money out is gone; Job work is still there because this document never named it, and
    // an unclaimed band is put back where it ships rather than dropped.
    expect(bands.map((band) => band.key)).toEqual(['board.band.moneyIn', 'board.band.jobWork']);
  });

  it('builds the tabs and bands a shop invented, with the colour it chose', () => {
    const seen = board([
      at('grp:counter', {
        label: 'Counter',
        children: [
          at('grp:takings', {
            label: 'Takings',
            tone: 'in',
            children: [at('nav.sale'), at('nav.billManagement')],
          }),
        ],
      }),
    ]);

    const counter = seen[0];
    expect(counter.key).toBe('grp:counter');
    expect(counter.label).toBe('Counter');
    expect(counter.bands[0].label).toBe('Takings');
    expect(counter.bands[0].tone).toBe('in');
    expect(counter.bands[0].tiles.map((tile) => tile.key)).toEqual([
      'nav.sale',
      'nav.billManagement',
    ]);
  });

  it('reads a colour no build of this app writes as no colour at all', () => {
    // The document is stored without the backend knowing what any of it means, so this is
    // what a hand-edited row looks like arriving. A `data-tone` no stylesheet answers would
    // draw a band with no colour and no explanation.
    const seen = board([
      at('grp:counter', {
        label: 'Counter',
        children: [
          at('grp:odd', { label: 'Odd', tone: 'chartreuse' as never, children: [at('nav.sale')] }),
        ],
      }),
    ]);

    expect(seen[0].bands[0].tone).toBe('read');
  });

  it('gives a button moved straight onto a tab a band of its own, in place', () => {
    const seen = board([
      at('grp:counter', {
        label: 'Counter',
        children: [
          at('nav.sale'),
          at('grp:books', { label: 'Books', children: [at('nav.ledger')] }),
          at('nav.cashbook'),
        ],
      }),
    ]);

    const bands = seen[0].bands;
    // Three bands, in the order they were arranged: the heading an owner never wrote is
    // absent rather than invented, and the run of buttons keeps the place it was put in.
    expect(bands.map((band) => band.key)).toEqual([null, 'grp:books', null]);
    expect(bands.map((band) => band.tiles.map((tile) => tile.key))).toEqual([
      ['nav.sale'],
      ['nav.ledger'],
      ['nav.cashbook'],
    ]);
  });

  it('surfaces a screen no tab claims instead of losing it', () => {
    // The forward-compatibility bargain, from the other side: a button an owner dragged out
    // of every tab, or a screen shipped after the board table was written, has to turn up
    // somewhere it can still be pressed.
    //
    // The cast is the whole point of the case. In the build that ships this screen the key is
    // an ordinary TranslationKey, added with its screen; here it stands for one this build has
    // never heard of, which is the only way to write down "a key EASY_NAV does not name" while
    // every key it *does* name is in the union.
    const shippedSinceThisBuild = 'nav.somethingNew' as unknown as TranslationKey;
    const seen = boardFor([
      { kind: 'link', key: shippedSinceThisBuild, path: 'something-new', icon: 'stock' },
    ]);

    expect(tabKeys(seen)).toEqual(['board.tab.more']);
    expect(keys(seen)).toEqual(['nav.somethingNew']);
    expect(tiles(seen)[0].digit).toBe(1);
  });

  it('leaves the shipped board standing within the three levels it draws', () => {
    // The measure a move is checked against, applied to the table itself: a tab is three
    // levels tall, so it fits at the top and nowhere else.
    expect(fits(EASY_NAV, 0, 3)).toBe(true);
    expect(EASY_NAV.map(height)).toEqual(EASY_NAV.map(() => 3));
  });

  it('files a claimed screen once, not on every tab that could take it', () => {
    expect(new Set(keys(board())).size).toBe(keys(board()).length);
  });
});

/**
 * Which sheet the board opens on. Three claims in order — the address, then where this
 * browser was left, then the first tab — and the order is the feature: a counter tablet spends
 * all day on one kind of work, so coming back to Entry rather than to tab one is a tap the same
 * person otherwise pays over and over; but an address naming a sheet still has to win, or every
 * link and Back press into the board would land somewhere other than where it said.
 */
describe('openSheet', () => {
  const tabs = board();
  const [first, second] = tabs;

  it('opens the sheet the address names, over anything remembered', () => {
    expect(openSheet(tabs, second.key, first.key)).toBe(second);
  });

  it('opens the sheet this browser was left on when the address names none', () => {
    expect(openSheet(tabs, undefined, second.key)).toBe(second);
  });

  it('opens the first sheet when nothing has been remembered yet', () => {
    expect(openSheet(tabs, undefined, null)).toBe(first);
  });

  // A bookmark from a build where that tab existed, or a hand-typed URL. Either way it lands
  // on the board rather than on a blank page.
  it('falls past a tab this build no longer has, in both the address and the memory', () => {
    expect(openSheet(tabs, 'board.tab.gone', second.key)).toBe(second);
    expect(openSheet(tabs, 'board.tab.gone', 'board.tab.alsoGone')).toBe(first);
  });

  it('has nothing to open for a role whose board is empty', () => {
    expect(openSheet([], undefined, null)).toBeUndefined();
  });
});
