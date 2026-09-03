import { TranslationKey } from '../../core/i18n/translations/en';
import { BoardTone } from '../../core/store/store.models';
import { NavIcon } from '../../shared/nav-icon/nav-icon';
import { CustomKey, NAV, NavGroup, NavItem, NavLink } from './nav';

export type { BoardTone };

/** One button on the board: a menu entry, its mark, and the key that opens it. */
export interface BoardTile extends NavLink {
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
  /**
   * The band's own key, or null for a run of buttons sitting straight on the sheet with no
   * heading over them — which is what an owner gets by moving an entry onto a tab rather than
   * into one of its bands. A heading is a thing you write; not having written one is not an
   * error to be papered over with a made-up word.
   */
  key: TranslationKey | CustomKey | null;
  /** This shop's own name for the band, or undefined to use its translation. */
  label?: string;
  tone: BoardTone;
  tiles: BoardTile[];
}

export interface BoardTab {
  key: TranslationKey | CustomKey;
  label?: string;
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
 * The board as it ships — the same entries as the sidebar, cut a different way.
 *
 * The sidebar is a list, so it is ordered by how often a shop reaches for something. A board
 * is a *surface*, so it is grouped by what you came to do: record something, read something,
 * or set something up. That regrouping is what a shop starts from, not what it is stuck
 * inside: {@link EASY_NAV} turns this table into a menu like any other, and a shop rearranges
 * it under Settings › Menu exactly as it rearranges the sidebar — its own tabs, its own
 * bands, its own names.
 *
 * Only the shape is written here. Which entries exist, what they are called, what is hidden
 * and what a role may reach all still come from `NAV` and the shop's arrangement, which is
 * why nothing below repeats a path, a label or a permission — only a key, and an icon where
 * a button wants a different mark from the sidebar row (Purchases reads better as a bill in
 * a list and as a purchase on a button).
 */
const BOARD: readonly TabDef[] = [
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

/**
 * Every entry that opens something, by key, carrying down what the groups above it decided.
 *
 * `writes` is set on the New Entry group rather than on each of its six screens, and
 * `requires` on the group rather than on each child, so a tile lifted out of that group and
 * onto a board tab would come out of a closed shop looking usable and out of a viewer's menu
 * looking reachable. Pushing both down here is what makes a flat surface safe to build from a
 * nested table. A mark is not among them: every entry carries its own.
 */
function flatten(
  items: readonly NavItem[],
  inherited: Pick<NavLink, 'requires' | 'writes'> = {},
): Map<string, NavLink> {
  const out = new Map<string, NavLink>();
  for (const item of items) {
    const carried: Pick<NavLink, 'requires' | 'writes'> = {
      requires: item.requires ?? inherited.requires,
      writes: item.writes ?? inherited.writes,
    };
    if (item.kind === 'link') {
      out.set(item.key, { ...item, ...carried });
      continue;
    }
    for (const [key, link] of flatten(item.children, carried)) {
      out.set(key, link);
    }
  }
  return out;
}

/**
 * The board the app ships with, as a menu: {@link BOARD}'s tabs and bands filled from `NAV`.
 *
 * This is to the board what `NAV` is to the sidebar — the table a shop's own arrangement is
 * merged against, and the whole of the board for a shop that has never arranged one. Three
 * levels deep because that is what the board draws: a tab holds bands, a band holds buttons.
 *
 * Built here rather than written out because every entry already exists in `NAV`, with its
 * path, its mark and its permissions; writing them again would be two tables to keep in step.
 * It is also what keeps a screen from being lost: anything `NAV` has that no band above
 * claimed is appended to the overflow tab, so a screen shipped after this table was written
 * still has a button.
 */
export const EASY_NAV: NavItem[] = buildEasyNav();

function buildEasyNav(): NavItem[] {
  const left = flatten(NAV);

  const band = (def: BandDef): NavGroup => ({
    kind: 'group',
    key: def.key,
    // Nothing draws a tab's or a band's mark — the board heads them with words, and the
    // arranging screen with a name box. It is here because every group carries one.
    icon: 'menu',
    tone: def.tone,
    children: def.items.flatMap<NavItem>(({ key, icon }) => {
      const link = left.get(key);
      if (!link) {
        return [];
      }
      left.delete(key);
      return [{ ...link, icon }];
    }),
  });

  const tabs: NavGroup[] = BOARD.map((def): NavGroup => ({
    kind: 'group',
    key: def.key,
    icon: 'menu',
    children: def.bands.map(band).filter((b) => b.children.length > 0),
  })).filter((tab) => tab.children.length > 0);

  const rest = [...left.values()];
  if (rest.length) {
    tabs.push({
      kind: 'group',
      key: OVERFLOW.key,
      icon: 'menu',
      children: [{ ...band(OVERFLOW.bands[0]), children: rest }],
    });
  }
  return tabs;
}

/**
 * The board this caller sees, drawn from the menu they were already given.
 *
 * Pass the finished board menu — `arranged(role, saved.easyMenu, EASY_NAV, 3)` — not
 * `EASY_NAV`. Everything that pipeline decides holds here: a viewer has no New Entry tiles, a
 * hidden entry has no button, a renamed one is renamed. This function only changes the shape:
 * a top-level group is a tab, a group inside it is a band, and a link is a button.
 *
 * The two things a menu can be that a board cannot are answered rather than refused. A run of
 * links sitting straight on a tab becomes one band with no heading, in place, so the order an
 * owner arranged is the order they get. A link left at the very top level — an owner who
 * moved one out of every tab — lands on the overflow tab, because a button with nowhere to be
 * drawn is a screen that has quietly become unreachable.
 */
export function boardFor(menu: readonly NavItem[]): BoardTab[] {
  const tabs: BoardTab[] = [];
  const loose: NavLink[] = [];

  for (const item of menu) {
    if (item.kind === 'link') {
      loose.push(item);
      continue;
    }
    // Restarted per tab: the digit is printed on the sheet the reader is looking at.
    const next = numbering();
    const bands: BoardBand[] = [];
    /** The run of headingless buttons currently being collected, if any. */
    let run: BoardBand | null = null;

    for (const child of item.children) {
      if (child.kind === 'link') {
        run ??= addBand(bands, { key: null, tone: 'read', tiles: [] });
        run.tiles.push(next(child));
        continue;
      }
      run = null;
      const tiles = child.children.flatMap<BoardTile>((leaf) =>
        leaf.kind === 'link' ? [next(leaf)] : [],
      );
      if (tiles.length) {
        addBand(bands, { key: child.key, label: child.label, tone: child.tone ?? 'read', tiles });
      }
    }

    if (bands.length) {
      tabs.push({ key: item.key, label: item.label, bands });
    }
  }

  if (loose.length) {
    const next = numbering();
    tabs.push({
      key: OVERFLOW.key,
      bands: [{ key: OVERFLOW.bands[0].key, tone: 'read', tiles: loose.map(next) }],
    });
  }

  return tabs;
}

/** Buttons are numbered 1–9 within a sheet; the rest are opened by hand. */
function numbering(): (link: NavLink) => BoardTile {
  let digit = 0;
  return (link) => {
    digit += 1;
    return { ...link, digit: digit <= 9 ? digit : 0 };
  };
}

function addBand(bands: BoardBand[], band: BoardBand): BoardBand {
  bands.push(band);
  return band;
}

/**
 * Which sheet the board opens, in order of what has the better claim to know.
 *
 * The URL first: it is what a link, a bookmark and the Back button all carry, so an address
 * naming a sheet must open that sheet or the address is lying. Then the one this browser left
 * open, which is what makes a counter tablet come back to the work it was doing rather than to
 * the first tab every time. Then the first tab, which is also what catches a misspelt or stale
 * `?tab=` — a bookmark from a build where that tab existed has to land on the board, not on
 * nothing.
 */
export function openSheet(
  tabs: readonly BoardTab[],
  requested: string | undefined,
  remembered: string | null,
): BoardTab | undefined {
  return (
    tabs.find((tab) => tab.key === requested) ??
    tabs.find((tab) => tab.key === remembered) ??
    tabs[0]
  );
}
