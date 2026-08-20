import { TranslationKey } from '../../core/i18n/translations/en';
import { MenuSetting } from '../../core/store/store.models';
import { BOARD, BoardTab, BoardTile, boardFor, openSheet } from './board';
import { NAV, NavGroup, arranged } from './nav';

const at = (key: string, extra: Partial<MenuSetting> = {}): MenuSetting => ({ key, ...extra });

const tiles = (tabs: readonly BoardTab[]): BoardTile[] =>
  tabs.flatMap((tab) => tab.bands.flatMap((band) => band.tiles));

const keys = (tabs: readonly BoardTab[]) => tiles(tabs).map((tile) => tile.key);

const tabKeys = (tabs: readonly BoardTab[]) => tabs.map((tab) => tab.key);

/** Every menu entry that has a screen behind it, groups flattened away. */
const everyLeaf = () =>
  NAV.flatMap((item) => (item.kind === 'link' ? [item.key] : item.children.map((c) => c.key)));

/**
 * The board as one person in one shop sees it. What matters here is that it is a *re-grouping*
 * of the sidebar's menu and never a second one: nothing appears on it that the sidebar refused,
 * nothing the sidebar offers falls off it, and the shop's own arrangement carries across.
 */
describe('boardFor', () => {
  it('lays out every screen an owner can reach', () => {
    const board = boardFor(arranged('OWNER'));

    // Nothing lost between the sidebar and the board — the whole point of deriving one from
    // the other rather than writing the buttons out by hand.
    expect(keys(board).sort()).toEqual(everyLeaf().sort());
  });

  it('has a home on the board for every entry the table names', () => {
    // The other direction: a key in BOARD that NAV no longer has would be a button that never
    // renders, which is invisible until someone goes looking for the screen.
    const named = BOARD.flatMap((tab) => tab.bands.flatMap((band) => band.items.map((i) => i.key)));

    expect(named.filter((key) => !everyLeaf().includes(key))).toEqual([]);
  });

  it('numbers the buttons within each tab, restarting on the next one', () => {
    const board = boardFor(arranged('OWNER'));

    for (const tab of board) {
      const digits = tab.bands.flatMap((band) => band.tiles.map((tile) => tile.digit));
      expect(digits).toEqual(digits.map((_, i) => (i < 9 ? i + 1 : 0)));
    }
  });

  it('offers a viewer nothing their role does not reach', () => {
    const board = boardFor(arranged('VIEWER'));

    // The whole New Entry group is above a viewer's rank, so the Entry tab has nothing to
    // hold and goes with it rather than standing empty.
    expect(keys(board)).not.toContain('nav.sale');
    expect(tabKeys(board)).not.toContain('board.tab.entry');
    expect(keys(board)).toContain('nav.cashbook');
  });

  it('leaves out what the shop hid', () => {
    const board = boardFor(arranged('OWNER', [at('nav.inventory', { hidden: true })]));

    expect(keys(board)).not.toContain('nav.inventory');
  });

  it("uses the shop's own name for an entry", () => {
    const board = boardFor(arranged('OWNER', [at('nav.ledger', { label: 'Khata' })]));

    expect(tiles(board).find((tile) => tile.key === 'nav.ledger')?.label).toBe('Khata');
  });

  it('carries a group\'s "writes" down to the buttons it flattens', () => {
    // `writes` is set on the New Entry group, not on its six screens. A child that dropped it
    // would come out of a closed shop looking usable and refuse on save.
    const board = boardFor(arranged('OWNER'));

    expect(tiles(board).find((tile) => tile.key === 'nav.sale')?.writes).toBe(true);
    expect(tiles(board).find((tile) => tile.key === 'nav.cashbook')?.writes).toBeUndefined();
  });

  it('drops a band that has nothing left in it', () => {
    const entry = NAV.find((item) => item.key === 'nav.newEntry') as NavGroup;
    const board = boardFor(
      arranged('OWNER', [
        at('nav.newEntry', {
          children: entry.children.map((child) => at(child.key, { hidden: child.key !== 'nav.sale' })),
        }),
      ]),
    );

    const bands = board.find((tab) => tab.key === 'board.tab.entry')?.bands ?? [];
    expect(bands.map((band) => band.key)).toEqual(['board.band.moneyIn']);
  });

  it('surfaces a screen no tab claims instead of losing it', () => {
    // The forward-compatibility bargain, from the other side: a screen shipped after this
    // table was written has to turn up somewhere it can be pressed.
    //
    // The cast is the whole point of the case. In the build that ships this screen the key is
    // an ordinary TranslationKey, added with its screen; here it stands for one this build has
    // never heard of, which is the only way to write down "a key BOARD does not name" while
    // every key BOARD *does* name is in the union.
    const shippedSinceThisBuild = 'nav.somethingNew' as unknown as TranslationKey;
    const board = boardFor([
      { kind: 'link', key: shippedSinceThisBuild, path: 'something-new', icon: 'stock' },
    ]);

    expect(tabKeys(board)).toEqual(['board.tab.more']);
    expect(keys(board)).toEqual(['nav.somethingNew']);
    expect(tiles(board)[0].digit).toBe(1);
  });

  it('files a claimed screen once, not on every tab that could take it', () => {
    const board = boardFor(arranged('OWNER'));

    expect(new Set(keys(board)).size).toBe(keys(board).length);
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
  const board = boardFor(arranged('OWNER'));
  const [first, second] = board;

  it('opens the sheet the address names, over anything remembered', () => {
    expect(openSheet(board, second.key, first.key)).toBe(second);
  });

  it('opens the sheet this browser was left on when the address names none', () => {
    expect(openSheet(board, undefined, second.key)).toBe(second);
  });

  it('opens the first sheet when nothing has been remembered yet', () => {
    expect(openSheet(board, undefined, null)).toBe(first);
  });

  // A bookmark from a build where that tab existed, or a hand-typed URL. Either way it lands
  // on the board rather than on a blank page.
  it('falls past a tab this build no longer has, in both the address and the memory', () => {
    expect(openSheet(board, 'board.tab.gone', second.key)).toBe(second);
    expect(openSheet(board, 'board.tab.gone', 'board.tab.alsoGone')).toBe(first);
  });

  it('has nothing to open for a role whose board is empty', () => {
    expect(openSheet([], undefined, null)).toBeUndefined();
  });
});
