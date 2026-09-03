import { TranslationKey } from '../../core/i18n/translations/en';
import { BoardTone, MenuSetting, StoreRole } from '../../core/store/store.models';
import { NavIcon } from '../../shared/nav-icon/nav-icon';

export type { NavIcon };

/**
 * The id of a group a shop made for itself. Deliberately not a `TranslationKey`: there is no
 * built-in wording for "Counter work" to fall back to, so the name the shop typed is the only
 * name it has — which is why `mergeMenu` dissolves an unnamed one rather than drawing a
 * heading nobody can read. The prefix is also how a saved document tells a shop's own group
 * apart from a key naming a screen this build has since retired: the first is rebuilt, the
 * second is dropped.
 */
export type CustomKey = `grp:${string}`;

const CUSTOM = 'grp:';

export function isCustomGroup(key: string): key is CustomKey {
  return key.startsWith(CUSTOM);
}

/** A fresh id for a group a shop is making now. Unique within one document, which is all it has to be. */
export function customKey(): CustomKey {
  return `${CUSTOM}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * One openable entry in the menu. The same shape wherever it sits — a shop can drag any of
 * them out of a group and onto the top level, so there is no such thing as a "sub-item" type
 * with less to it. That is why every one of them carries an `icon`: the sidebar draws a mark
 * beside a top-level row, and an entry that only ever lived in a group would have none the
 * day someone promotes it.
 */
export interface NavLink {
  kind: 'link';
  key: TranslationKey;
  /** Relative to the current store — the shell prefixes it via StoreService.link. */
  path: string;
  icon: NavIcon;
  /**
   * The weakest role this item is offered to; anything reachable by everyone leaves it
   * out. The shell filters on it, and the matching route carries `editorGuard`/`ownerGuard`
   * so a typed URL lands the same way — hiding a link is presentation, not a control.
   */
  requires?: Extract<StoreRole, 'EDITOR' | 'OWNER'>;
  /**
   * Set on anything that records something, so it can be shown greyed while the owner's plan
   * has this shop closed instead of quietly bouncing to the dashboard. Two different facts,
   * shown two different ways: `requires` is a rank the user never had, so it is dropped;
   * this is something that was there yesterday, so it stays visible with its reason on it.
   */
  writes?: true;
  /**
   * Set on the few items an owner may not hide, because hiding them is how you lock yourself
   * out: the Settings group and the screen that does the arranging. Everything else is fair
   * game — a shop that never counts stock should be able to lose Inventory from its menu.
   *
   * A group holding one of these cannot be hidden either, however it was assembled — see
   * {@link mergeMenu}. Without that, dragging Menu into a group of your own and switching the
   * group off would be a way around the lock.
   */
  locked?: true;

  // ── Filled in by mergeMenu, never written in the table below ──────────
  /** This shop's own name for the item, or undefined to use its translation. */
  label?: string;
  /** Arranged out of this shop's sidebar. `locked` items are never marked. */
  hidden?: boolean;
}

/**
 * A heading with entries under it: a drawer of the sidebar, or — on the board, which is the
 * same menu cut for a counter — a tab, or one band of a tab.
 *
 * `children` is `NavItem[]` rather than `NavLink[]` because those two shapes are two depths
 * of the same idea and only the depth differs: the sidebar draws one level of nesting, the
 * board draws two (tab → band → tile). Which of the two a table is allowed is the `maxDepth`
 * argument to {@link mergeMenu}, not a second type — a group is a group at either depth, and
 * two types would mean two of everything that walks one.
 */
export interface NavGroup {
  kind: 'group';
  /** A built-in group's translation key, or the id of one this shop made. */
  key: TranslationKey | CustomKey;
  icon: NavIcon;
  requires?: NavLink['requires'];
  writes?: NavLink['writes'];
  locked?: NavLink['locked'];
  label?: NavLink['label'];
  hidden?: NavLink['hidden'];
  /**
   * Which way money moves through this band of the board, for the one level of the board
   * that is coloured. Nothing in the sidebar reads it, and nothing sets it there.
   */
  tone?: BoardTone;
  children: NavItem[];
}

export type NavItem = NavLink | NavGroup;

// Paths are store-relative: the shell renders each through StoreService.link, which
// puts the current store in front. The whole menu lives inside /s/:storeId, where a
// store always exists by definition — what varies is the caller's role in it.
export const NAV: NavItem[] = [
  { kind: 'link', key: 'nav.dashboard', path: 'dashboard', icon: 'dashboard' },
  { kind: 'link', key: 'nav.cashbook', path: 'cashbook', icon: 'cashbook' },
  { kind: 'link', key: 'nav.ledger', path: 'ledger', icon: 'ledger' },
  { kind: 'link', key: 'nav.inventory', path: 'inventory', icon: 'stock' },
  { kind: 'link', key: 'nav.processedGoods', path: 'processing', icon: 'stock' },
  { kind: 'link', key: 'nav.billManagement', path: 'bill-management', icon: 'bill' },
  { kind: 'link', key: 'nav.purchases', path: 'purchases', icon: 'bill' },
  {
    kind: 'group',
    key: 'nav.newEntry',
    icon: 'entry',
    // Nothing here does anything for a viewer — the whole group goes rather than
    // offering five screens that refuse to save.
    requires: 'EDITOR',
    writes: true,
    children: [
      { kind: 'link', key: 'nav.sale', path: 'new-entry/sale', icon: 'sale' },
      { kind: 'link', key: 'nav.receipt', path: 'new-entry/receipt', icon: 'receipt' },
      { kind: 'link', key: 'nav.purchase', path: 'new-entry/purchase', icon: 'purchase' },
      { kind: 'link', key: 'nav.processing', path: 'new-entry/processing', icon: 'processing' },
      { kind: 'link', key: 'nav.expense', path: 'new-entry/expense', icon: 'expense' },
      { kind: 'link', key: 'nav.payment', path: 'new-entry/payment', icon: 'payment' },
    ],
  },
  {
    kind: 'group',
    key: 'nav.settings',
    icon: 'settings',
    // The one group that cannot be arranged away. Everything a shop can undo lives behind
    // it, including the screen that does the arranging — hiding this would leave an owner
    // with a menu they can no longer change from inside the app.
    //
    // Emptying it is a different thing and is allowed: dragging every child out to the top
    // level leaves the heading with nothing to hold, so `visible` drops it — and every screen
    // that was behind it is now one click nearer, not gone.
    locked: true,
    children: [
      // Editors get in for the opening drawer balance; the rest of the page is
      // read-only for them (see SettingsGeneral). No `writes`: a closed shop keeps this
      // screen, which is where its owner deletes it.
      {
        kind: 'link',
        key: 'nav.settings.general',
        path: 'settings/general',
        icon: 'settings',
        requires: 'EDITOR',
      },
      // Open to everyone: it is where each user edits their own account. The shop's people
      // are still the owner's alone, and that half of the screen only appears for them.
      // Freeing a seat is one way out of an overage, so this stays open on a closed shop too.
      { kind: 'link', key: 'nav.settings.users', path: 'settings/users', icon: 'users' },
      {
        kind: 'link',
        key: 'nav.settings.items',
        path: 'settings/items',
        icon: 'items',
        requires: 'EDITOR',
        writes: true,
      },
      {
        kind: 'link',
        key: 'nav.settings.party',
        path: 'settings/party',
        icon: 'party',
        requires: 'EDITOR',
        writes: true,
      },
      {
        kind: 'link',
        key: 'nav.settings.units',
        path: 'settings/units',
        icon: 'units',
        requires: 'EDITOR',
        writes: true,
      },
      // Owner-only, and locked for the same reason its group is: this is the screen that
      // un-hides the others. No `writes` — arranging a menu records no business, so it stays
      // usable on a shop the plan has closed.
      {
        kind: 'link',
        key: 'nav.settings.menu',
        path: 'settings/menu',
        icon: 'menu',
        requires: 'OWNER',
        locked: true,
      },
      // Owner-only: these sends are metered against their plan and go to their customers. No
      // `writes` — a closed shop records nothing, but its owner should still be able to reach
      // this and switch the reminders off rather than have them keep going out unseen.
      {
        kind: 'link',
        key: 'nav.settings.reports',
        path: 'settings/reports',
        icon: 'reports',
        requires: 'OWNER',
      },
    ],
  },
];

/** Weakest first, mirroring the backend `StoreRole` — a role carries every rank below it. */
const RANK: Record<StoreRole, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/**
 * The menu as one role sees it: items above their role are dropped, empty groups with them.
 *
 * `table` is which shipped menu to filter — {@link NAV} for the sidebar, `EASY_NAV` for the
 * board. It is also how this recurses into a group's children, which is why the two are one
 * parameter: a group nested inside a group is filtered by exactly the rules its parent was.
 */
export function navFor(role: StoreRole | null, table: readonly NavItem[] = NAV): NavItem[] {
  const allowed = (item: { requires?: NavLink['requires'] }) =>
    !item.requires || (role !== null && RANK[role] >= RANK[item.requires]);

  return table.filter(allowed).flatMap<NavItem>((item) => {
    if (item.kind === 'link') {
      return [item];
    }
    const children = navFor(role, item.children);
    return children.length ? [{ ...item, children }] : [];
  });
}

/** A shop's name for an item, or nothing — a blank override is not an override. */
function labelOf(setting: MenuSetting | undefined): string | undefined {
  return setting?.label?.trim() || undefined;
}

const TONES: readonly BoardTone[] = ['in', 'out', 'read'];

/**
 * The colour a saved band asked for, or nothing.
 *
 * Checked against the list rather than trusted, because the backend stores this document
 * without knowing what any of it means — a hand-edited row could hold any string, and one
 * that reached the board would land in a `data-tone` attribute no stylesheet answers.
 */
function toneOf(setting: MenuSetting | undefined): BoardTone | undefined {
  return setting?.tone && TONES.includes(setting.tone) ? setting.tone : undefined;
}

/**
 * The mark a shop's own group wears: the one belonging to the first entry in it.
 *
 * Borrowed rather than chosen, because a group made on this screen has no mark of its own and
 * asking a shopkeeper to pick one is a question with no good answer. Borrowing gets it right
 * for free in the case that matters — a group someone built around Sale opens with the sale
 * tag — and an empty group never reaches the sidebar at all (see {@link visible}), so the
 * fallback is only ever seen on this screen while the group is still being filled.
 */
function borrowedIcon(children: readonly NavItem[]): NavIcon {
  return children[0]?.icon ?? 'menu';
}

/**
 * How many levels of list an item takes up where it lands: 1 for an entry, and for a group
 * one more than the deepest thing under it.
 *
 * An empty group still counts as 2. It is empty because it was made a moment ago and has not
 * been filled yet, so measuring it as the 1 level it currently occupies would let it be put
 * somewhere with no room for the first thing dropped into it — a heading that can never hold
 * anything is worse than one that was never offered.
 *
 * This is what a move is checked against: a group is not one thing being placed, it is
 * everything under it being placed with it, and a board tab carries a whole level of bands.
 */
export function height(item: NavItem): number {
  return item.kind === 'link' ? 1 : 1 + Math.max(1, ...item.children.map(height));
}

/**
 * Whether an item is, or contains at any depth, a screen that may not be hidden. The rule the
 * lock actually rests on: without it, dragging Menu into a group of your own and switching
 * that group off would be the way around it.
 */
export function holdsLocked(item: NavItem): boolean {
  return item.locked === true || (item.kind === 'group' && item.children.some(holdsLocked));
}

/**
 * The menu this shop has arranged: `nav` regrouped, reordered, renamed, and marked up with
 * what is hidden. Every item is still here — hidden ones are flagged, not dropped, because
 * the screen that does the arranging has to show them to bring them back. The sidebar pipes
 * the result through {@link visible}; the settings screen uses it as it stands.
 *
 * The saved document decides *placement*, not just order: an entry sits wherever its key
 * appears, so a shop can lift Sale out of New Entry and drop it into a group of its own
 * making beside Bill Management. Groups a shop made carry a `grp:` key and are rebuilt from
 * the document alone, since this build has nothing to match them against.
 *
 * Runs *after* `navFor`, never instead of it. Role decides what exists, the arrangement only
 * decides how what exists is presented, and the catalogue below is built from what `navFor`
 * left — so no arrangement can hand anyone a screen their role does not reach, whatever is in
 * the stored document.
 *
 * ## Depth
 *
 * `maxDepth` is how many levels of list the surface being drawn actually has: 2 for the
 * sidebar (a drawer of entries) and 3 for the board (a tab of bands of buttons). A group
 * standing deeper than that is dissolved rather than drawn, its children kept one level up —
 * the same bargain an unnamed group gets, and for the same reason: a heading nothing can
 * render is worse than no heading. It is a number and not two code paths because the two
 * surfaces differ only in how deep they go.
 *
 * ## Forward compatibility
 *
 * A stored arrangement is a list of keys written at some past version, so it will eventually
 * be missing an item (a screen shipped since) and holding one that is gone (a screen retired).
 * Neither may break a menu. A key this build does not recognise is simply not found and falls
 * out; an entry no part of the document claimed is appended at the end of wherever it ships —
 * its own group if that group is still on the menu, and the top level otherwise, where it can
 * be seen and moved. A duplicate key, only reachable from a hand-edited document, is taken
 * once.
 */
export function mergeMenu(
  nav: readonly NavItem[],
  saved: readonly MenuSetting[] = [],
  maxDepth = 2,
): NavItem[] {
  // What this build has to place, flattened: placement comes from the document, so where an
  // entry ships no longer decides where it may go.
  const links = new Map<string, NavLink>();
  const builtInGroups = new Map<string, NavGroup>();
  const catalogue = (items: readonly NavItem[]): void => {
    for (const item of items) {
      if (item.kind === 'link') {
        links.set(item.key, item);
        continue;
      }
      builtInGroups.set(item.key, item);
      catalogue(item.children);
    }
  };
  catalogue(nav);

  const taken = new Set<string>();
  /** Groups already emitted, so a stray child can still be appended to the one it ships in. */
  const emitted = new Map<string, NavGroup>();

  const arrange = (link: NavLink, setting: MenuSetting | undefined): NavLink => ({
    ...link,
    label: labelOf(setting),
    hidden: link.locked !== true && setting?.hidden === true,
  });

  /** One level of the saved document, in the order it was written. */
  const build = (settings: readonly MenuSetting[], depth: number): NavItem[] => {
    const out: NavItem[] = [];
    for (const setting of settings) {
      if (taken.has(setting.key)) {
        continue;
      }
      const builtIn = builtInGroups.get(setting.key);
      // Narrowed into a value rather than tested inline, so the `grp:` key carries its own
      // type down to where the group is built.
      const custom: CustomKey | undefined = isCustomGroup(setting.key) ? setting.key : undefined;

      if (!builtIn && custom === undefined) {
        // A plain entry, wherever the document put it — or a key naming a screen that is gone.
        const link = links.get(setting.key);
        if (link) {
          taken.add(setting.key);
          out.push(arrange(link, setting));
        }
        continue;
      }

      // Claimed before recursing, so a document naming a group inside itself cannot loop.
      taken.add(setting.key);
      const children = build(setting.children ?? [], depth + 1);
      const label = labelOf(setting);

      // Two ways a group does not survive, both of which keep everything that was inside it:
      // it stands deeper than this surface draws, or it is a group the shop made and never
      // named, which has no name in either language to draw.
      if (depth >= maxDepth || (custom !== undefined && !label)) {
        out.push(...children);
        continue;
      }

      const group: NavGroup = builtIn
        ? {
            ...builtIn,
            label,
            tone: toneOf(setting) ?? builtIn.tone,
            hidden: setting.hidden === true,
            children,
          }
        : {
            kind: 'group',
            key: custom as CustomKey,
            icon: borrowedIcon(children),
            label,
            tone: toneOf(setting),
            hidden: setting.hidden === true,
            children,
          };
      emitted.set(group.key, group);
      out.push(group);
    }
    return out;
  };

  const out = build(saved, 1);

  /**
   * Everything this build has that no part of the document claimed, back where it ships —
   * appended to the group it ships in wherever the shop has since moved that group to, and
   * to `into` when it ships loose.
   */
  const fill = (items: readonly NavItem[], into: NavItem[]): void => {
    for (const item of items) {
      if (item.kind === 'link') {
        if (!taken.has(item.key)) {
          taken.add(item.key);
          into.push({ ...item, label: undefined, hidden: false });
        }
        continue;
      }
      const group = emitted.get(item.key);
      if (group) {
        fill(item.children, group.children);
        continue;
      }
      if (taken.has(item.key)) {
        // The document had this group and it did not survive — dissolved for standing deeper
        // than this surface draws. Its heading is gone, so what it ships with goes where the
        // heading would have been rather than under a second copy of it.
        fill(item.children, into);
        continue;
      }
      const opened: NavGroup = { ...item, label: undefined, hidden: false, children: [] };
      taken.add(item.key);
      emitted.set(item.key, opened);
      into.push(opened);
      fill(item.children, opened.children);
    }
  };
  fill(nav, out);

  // Hiding is settled last, because whether a group may be hidden depends on what ended up
  // inside it: a group holding a locked screen is the lock, so it cannot be switched off.
  const settle = (items: readonly NavItem[]): NavItem[] =>
    items.map((item) =>
      item.kind === 'link'
        ? item
        : {
            ...item,
            children: settle(item.children),
            hidden: item.hidden === true && !holdsLocked(item),
          },
    );
  return settle(out);
}

/**
 * What the sidebar actually draws: the arrangement minus everything hidden. A group whose
 * children are all hidden goes with them, the same way `navFor` drops one emptied by role —
 * a heading that opens onto nothing is worse than no heading. That is also what becomes of a
 * built-in group a shop emptied by dragging every entry out of it.
 */
export function visible(items: readonly NavItem[]): NavItem[] {
  return items.flatMap<NavItem>((item) => {
    if (item.hidden) {
      return [];
    }
    if (item.kind === 'link') {
      return [item];
    }
    const children = visible(item.children);
    return children.length ? [{ ...item, children }] : [];
  });
}

/**
 * The finished menu for one person in one shop: role first, then the shop's arrangement,
 * then drop what it hides. The three steps always run in that order and always all three, so
 * they are spelled out once here rather than at each of the two screens that draw a menu.
 *
 * The sidebar and the board each pass their own shipped table and their own saved document —
 * two arrangements, kept apart on purpose, so a shop that switches between them finds each as
 * it left it. What they share is this pipeline, which is what stops them drifting: neither
 * can offer a screen the other refuses, because role and locking are decided here for both.
 */
export function arranged(
  role: StoreRole | null,
  saved?: readonly MenuSetting[],
  table: readonly NavItem[] = NAV,
  maxDepth = 2,
): NavItem[] {
  return visible(mergeMenu(navFor(role, table), saved, maxDepth));
}
