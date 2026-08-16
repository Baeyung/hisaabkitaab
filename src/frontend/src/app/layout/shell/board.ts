import { TranslationKey } from '../../core/i18n/translations/en';
import { NavIcon } from '../../shared/nav-icon/nav-icon';
import { NavItem, NavLeaf } from './nav';

/**
 * What a band's colour means. Exactly one thing: which way money moves — `in` and `out` are
 * the only tones that say so.
 *
 * `read` is everything else: Reports and Setup opened nothing and closed nothing, so their
 * bands carry the app's own brand accent (see easy-board.css's --chip) rather than a direction.
 * It reads as the app's colour, not a receivable or a payable — the same distinction a button
 * or a link already makes everywhere else. An earlier pass gave Setup a colour that meant
 * nothing beyond "Setup", which is the one thing `read` still must never become: three tabs of
 * coloured headings that each say something different is decoration, and it drowns the one
 * tab where the colour is actually reporting a fact.
 */
export type BoardTone = 'in' | 'out' | 'read';

/** One button on the board: a menu entry, its mark, and the key that opens it. */
export interface BoardTile extends NavLeaf {
  icon: NavIcon;
  /**
   * The number key that opens this button, or 0 for the ones past nine, which have no
   * shortcut. Numbered within the open tab, because that is the sheet the digit is printed
   * on — the same key means something different once you switch tabs, and the print changes
   * with it.
   */
  digit: number;
}

export interface BoardBand {
  key: TranslationKey;
  tone: BoardTone;
  tiles: BoardTile[];
}

export interface BoardTab {
  key: TranslationKey;
  bands: BoardBand[];
}

interface BandDef {
  key: TranslationKey;
  tone: BoardTone;
  /** Menu entries by the same key `NAV` uses, in the order the band stacks them. */
  items: ReadonlyArray<{ key: TranslationKey; icon: NavIcon }>;
}

interface TabDef {
  key: TranslationKey;
  bands: readonly BandDef[];
}

/**
 * The board is not a second menu — it is the same menu, cut a different way.
 *
 * The sidebar is a list, so it is ordered by how often a shop reaches for something. A board
 * is a *surface*, so it is grouped by what you came to do: record something, read something,
 * or set something up. That regrouping is the whole feature. Everything else — which entries
 * exist, what they are called, what is hidden, what a role may reach — still comes from
 * `NAV` and the shop's own arrangement, which is why nothing here repeats a path or a label.
 *
 * A key naming an entry this build no longer has is simply not found, and an entry no tab
 * claims lands on the "Anything else" tab (see {@link boardFor}) — the same forward-
 * compatibility bargain `ordered()` makes in `nav.ts`, for the same reason: a screen shipped
 * after a shop's arrangement was written must never become unreachable.
 */
export const BOARD: readonly TabDef[] = [
  {
    key: 'board.tab.entry',
    bands: [
      {
        key: 'board.band.moneyIn',
        tone: 'in',
        items: [
          { key: 'nav.sale', icon: 'sale' },
          { key: 'nav.receipt', icon: 'receipt' },
        ],
      },
      {
        key: 'board.band.moneyOut',
        tone: 'out',
        items: [
          { key: 'nav.purchase', icon: 'purchase' },
          { key: 'nav.expense', icon: 'expense' },
          { key: 'nav.payment', icon: 'payment' },
        ],
      },
      // Its own band rather than folded into money out: the mill's bill is money out, but
      // what this screen records is cloth changing into other cloth, and a shopkeeper looking
      // for it is not thinking about the payment.
      {
        key: 'board.band.jobWork',
        tone: 'read',
        items: [{ key: 'nav.processing', icon: 'processing' }],
      },
    ],
  },
  {
    key: 'board.tab.reports',
    bands: [
      {
        key: 'board.band.books',
        tone: 'read',
        items: [
          { key: 'nav.dashboard', icon: 'dashboard' },
          { key: 'nav.cashbook', icon: 'cashbook' },
          { key: 'nav.ledger', icon: 'ledger' },
        ],
      },
      {
        key: 'board.band.papers',
        tone: 'read',
        items: [
          { key: 'nav.billManagement', icon: 'bill' },
          { key: 'nav.purchases', icon: 'purchase' },
        ],
      },
      {
        key: 'board.band.goods',
        tone: 'read',
        items: [
          { key: 'nav.inventory', icon: 'stock' },
          { key: 'nav.processedGoods', icon: 'processing' },
        ],
      },
    ],
  },
  {
    key: 'board.tab.setup',
    bands: [
      {
        key: 'board.band.shop',
        tone: 'read',
        items: [
          { key: 'nav.settings.general', icon: 'settings' },
          { key: 'nav.settings.menu', icon: 'menu' },
        ],
      },
      {
        key: 'board.band.people',
        tone: 'read',
        items: [
          { key: 'nav.settings.users', icon: 'users' },
          { key: 'nav.settings.party', icon: 'party' },
        ],
      },
      {
        key: 'board.band.catalogue',
        tone: 'read',
        items: [
          { key: 'nav.settings.items', icon: 'items' },
          { key: 'nav.settings.units', icon: 'units' },
        ],
      },
    ],
  },
];

/** Where an entry no tab claims turns up, so a new screen is never lost off the board. */
const OVERFLOW: TabDef = {
  key: 'board.tab.more',
  bands: [{ key: 'board.band.other', tone: 'read', items: [] }],
};

/** A menu entry with a path, flattened out of its group and carrying what the group decided. */
type Reachable = NavLeaf & { icon: NavIcon };

/**
 * Every entry the caller can actually open, by key.
 *
 * Groups are flattened away — the board has no drawers, so "New Entry" as a heading has
 * nothing to hold. What the group *decided*, though, comes down with its children: `writes`
 * is set on the New Entry group rather than on each of its six screens, and a child that
 * dropped it would come out of a closed shop looking usable.
 */
function reachable(menu: readonly NavItem[]): Map<string, Reachable> {
  const out = new Map<string, Reachable>();
  for (const item of menu) {
    if (item.kind === 'link') {
      out.set(item.key, { ...item, icon: item.icon });
      continue;
    }
    for (const child of item.children) {
      out.set(child.key, {
        ...child,
        icon: item.icon,
        writes: child.writes ?? item.writes,
        requires: child.requires ?? item.requires,
      });
    }
  }
  return out;
}

/**
 * The board this caller sees: {@link BOARD}'s grouping, filled from the menu they were
 * already given.
 *
 * Pass the finished sidebar menu — `visible(mergeMenu(navFor(role), saved))` — not `NAV`.
 * Everything the sidebar has decided by then holds here too: a viewer has no New Entry tiles,
 * a hidden entry has no button, and a renamed one is renamed on the board as well. Deriving
 * it instead of filtering again is what keeps the two from drifting apart, and it means an
 * owner arranging the menu is arranging both at once without being told there are two.
 *
 * Bands and tabs that come out empty are dropped: a heading over nothing is worse than no
 * heading, which is the rule `visible()` already follows in the sidebar.
 */
export function boardFor(menu: readonly NavItem[]): BoardTab[] {
  const left = reachable(menu);
  const tabs: BoardTab[] = [];

  for (const tab of BOARD) {
    // Restarted per tab: the digit is printed on the sheet the reader is looking at.
    let digit = 0;
    const bands: BoardBand[] = [];

    for (const band of tab.bands) {
      const tiles: BoardTile[] = [];
      for (const { key, icon } of band.items) {
        const leaf = left.get(key);
        if (!leaf) {
          continue;
        }
        left.delete(key);
        digit += 1;
        tiles.push({ ...leaf, icon, digit: digit <= 9 ? digit : 0 });
      }
      if (tiles.length) {
        bands.push({ key: band.key, tone: band.tone, tiles });
      }
    }

    if (bands.length) {
      tabs.push({ key: tab.key, bands });
    }
  }

  // Whatever no tab claimed, in the order the shop arranged it — a screen shipped since this
  // table was written, keeping its own mark.
  const rest = [...left.values()];
  if (rest.length) {
    tabs.push({
      key: OVERFLOW.key,
      bands: [
        {
          key: OVERFLOW.bands[0].key,
          tone: OVERFLOW.bands[0].tone,
          tiles: rest.map((leaf, i) => ({ ...leaf, digit: i < 9 ? i + 1 : 0 })),
        },
      ],
    });
  }

  return tabs;
}
