import { TranslationKey } from '../../core/i18n/translations/en';
import { MenuSetting, StoreRole } from '../../core/store/store.models';
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
  children: NavLink[];
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

/** The menu as one role sees it: items above their role are dropped, empty groups with them. */
export function navFor(role: StoreRole | null): NavItem[] {
  const allowed = (item: { requires?: NavLink['requires'] }) =>
    !item.requires || (role !== null && RANK[role] >= RANK[item.requires]);

  return NAV.filter(allowed).flatMap<NavItem>((item) => {
    if (item.kind === 'link') {
      return [item];
    }
    const children = item.children.filter(allowed);
    return children.length ? [{ ...item, children }] : [];
  });
}

/** A shop's name for an item, or nothing — a blank override is not an override. */
function labelOf(setting: MenuSetting | undefined): string | undefined {
  return setting?.label?.trim() || undefined;
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
function borrowedIcon(children: readonly NavLink[]): NavIcon {
  return children[0]?.icon ?? 'menu';
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
export function mergeMenu(nav: readonly NavItem[], saved: readonly MenuSetting[] = []): NavItem[] {
  // What this build has to place, flattened: placement comes from the document, so where an
  // entry ships no longer decides where it may go.
  const links = new Map<string, NavLink>();
  const builtInGroups = new Map<string, NavGroup>();
  for (const item of nav) {
    if (item.kind === 'link') {
      links.set(item.key, item);
      continue;
    }
    builtInGroups.set(item.key, item);
    for (const child of item.children) {
      links.set(child.key, child);
    }
  }

  const taken = new Set<string>();
  const out: NavItem[] = [];
  /** Groups already emitted, so a stray child can still be appended to the one it ships in. */
  const emitted = new Map<string, NavGroup>();

  const arrange = (link: NavLink, setting: MenuSetting | undefined): NavLink => ({
    ...link,
    label: labelOf(setting),
    hidden: link.locked !== true && setting?.hidden === true,
  });

  const openGroup = (group: NavGroup): NavGroup => {
    taken.add(group.key);
    emitted.set(group.key, group);
    out.push(group);
    return group;
  };

  for (const setting of saved) {
    if (taken.has(setting.key)) {
      continue;
    }
    const builtIn = builtInGroups.get(setting.key);
    // Narrowed into a value rather than tested inline, so the `grp:` key carries its own
    // type down to where the group is built.
    const custom: CustomKey | undefined = isCustomGroup(setting.key) ? setting.key : undefined;
    const link = links.get(setting.key);

    if (!builtIn && custom === undefined) {
      // A plain entry, wherever the document put it — or a key naming a screen that is gone.
      if (link) {
        taken.add(setting.key);
        out.push(arrange(link, setting));
      }
      continue;
    }

    const children: NavLink[] = [];
    for (const child of setting.children ?? []) {
      const childLink = links.get(child.key);
      if (childLink && !taken.has(child.key)) {
        taken.add(child.key);
        children.push(arrange(childLink, child));
      }
    }

    const label = labelOf(setting);
    // A group a shop made and never named has no name in either language, so it is dissolved
    // rather than drawn: its children keep their place in the order, one level up.
    if (custom !== undefined && !label) {
      out.push(...children);
      taken.add(setting.key);
      continue;
    }

    openGroup(
      builtIn
        ? { ...builtIn, label, hidden: false, children }
        : {
            kind: 'group',
            key: custom as CustomKey,
            icon: borrowedIcon(children),
            label,
            hidden: false,
            children,
          },
    );
  }

  // Everything this build has that no part of the document claimed, back where it ships.
  for (const item of nav) {
    if (item.kind === 'link') {
      if (!taken.has(item.key)) {
        taken.add(item.key);
        out.push({ ...item, label: undefined, hidden: false });
      }
      continue;
    }
    const group =
      emitted.get(item.key) ??
      openGroup({ ...item, label: undefined, hidden: false, children: [] });
    for (const child of item.children) {
      if (taken.has(child.key)) {
        continue;
      }
      taken.add(child.key);
      const arranged = arrange(child, undefined);
      group.children.push(arranged);
    }
  }

  // Hiding is settled last, because whether a group may be hidden depends on what ended up
  // inside it: a group holding a locked screen is the lock, so it cannot be switched off.
  const byKey = new Map(saved.map((setting) => [setting.key, setting]));
  return out.map((item) => {
    if (item.kind === 'link') {
      return item;
    }
    const holdsLocked = item.locked === true || item.children.some((child) => child.locked);
    return { ...item, hidden: !holdsLocked && byKey.get(item.key)?.hidden === true };
  });
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
    const children = item.children.filter((child) => !child.hidden);
    return children.length ? [{ ...item, children }] : [];
  });
}

/**
 * The finished menu for one person in one shop: role first, then the shop's arrangement,
 * then drop what it hides. The three steps always run in that order and always all three, so
 * they are spelled out once here rather than at each of the two screens that draw a menu.
 *
 * Both the sidebar and the board start from this, which is what stops them drifting: an owner
 * arranging the menu is arranging both, and neither can offer a screen the other refuses.
 */
export function arranged(role: StoreRole | null, saved?: readonly MenuSetting[]): NavItem[] {
  return visible(mergeMenu(navFor(role), saved));
}
