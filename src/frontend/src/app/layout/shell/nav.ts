import { TranslationKey } from '../../core/i18n/translations/en';
import { MenuSetting, StoreRole } from '../../core/store/store.models';

export type NavIcon = 'dashboard' | 'cashbook' | 'ledger' | 'entry' | 'stock' | 'bill' | 'settings';

export interface NavLeaf {
  key: TranslationKey;
  /** Relative to the current store — the shell prefixes it via StoreService.link. */
  path: string;
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
   *
   * Only groups and sub-items carry it today — every top-level link is a read screen, which
   * the shell relies on (see its `blocked`) and `nav.spec.ts` holds to.
   */
  writes?: true;
  /**
   * Set on the few items an owner may not hide, because hiding them is how you lock yourself
   * out: the Settings group and the screen that does the arranging. Everything else is fair
   * game — a shop that never counts stock should be able to lose Inventory from its menu.
   */
  locked?: true;

  // ── Filled in by mergeMenu, never written in the table below ──────────
  /** This shop's own name for the item, or undefined to use its translation. */
  label?: string;
  /** Arranged out of this shop's sidebar. `locked` items are never marked. */
  hidden?: boolean;
}

export interface NavLink extends NavLeaf {
  kind: 'link';
  icon: NavIcon;
}

export interface NavGroup {
  kind: 'group';
  key: TranslationKey;
  icon: NavIcon;
  requires?: NavLeaf['requires'];
  writes?: NavLeaf['writes'];
  locked?: NavLeaf['locked'];
  label?: NavLeaf['label'];
  hidden?: NavLeaf['hidden'];
  children: NavLeaf[];
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
      { key: 'nav.sale', path: 'new-entry/sale' },
      { key: 'nav.receipt', path: 'new-entry/receipt' },
      { key: 'nav.purchase', path: 'new-entry/purchase' },
      { key: 'nav.processing', path: 'new-entry/processing' },
      { key: 'nav.expense', path: 'new-entry/expense' },
      { key: 'nav.payment', path: 'new-entry/payment' },
    ],
  },
  {
    kind: 'group',
    key: 'nav.settings',
    icon: 'settings',
    // The one group that cannot be arranged away. Everything a shop can undo lives behind
    // it, including the screen that does the arranging — hiding this would leave an owner
    // with a menu they can no longer change from inside the app.
    locked: true,
    children: [
      // Editors get in for the opening drawer balance; the rest of the page is
      // read-only for them (see SettingsGeneral). No `writes`: a closed shop keeps this
      // screen, which is where its owner deletes it.
      { key: 'nav.settings.general', path: 'settings/general', requires: 'EDITOR' },
      // Open to everyone: it is where each user edits their own account. The shop's people
      // are still the owner's alone, and that half of the screen only appears for them.
      // Freeing a seat is one way out of an overage, so this stays open on a closed shop too.
      { key: 'nav.settings.users', path: 'settings/users' },
      { key: 'nav.settings.items', path: 'settings/items', requires: 'EDITOR', writes: true },
      { key: 'nav.settings.party', path: 'settings/party', requires: 'EDITOR', writes: true },
      { key: 'nav.settings.units', path: 'settings/units', requires: 'EDITOR', writes: true },
      // Owner-only, and locked for the same reason its group is: this is the screen that
      // un-hides the others. No `writes` — arranging a menu records no business, so it stays
      // usable on a shop the plan has closed.
      { key: 'nav.settings.menu', path: 'settings/menu', requires: 'OWNER', locked: true },
    ],
  },
];

/** Weakest first, mirroring the backend `StoreRole` — a role carries every rank below it. */
const RANK: Record<StoreRole, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/** The menu as one role sees it: items above their role are dropped, empty groups with them. */
export function navFor(role: StoreRole | null): NavItem[] {
  const allowed = (item: { requires?: NavLeaf['requires'] }) =>
    !item.requires || (role !== null && RANK[role] >= RANK[item.requires]);

  return NAV.filter(allowed).flatMap<NavItem>((item) => {
    if (item.kind === 'link') {
      return [item];
    }
    const children = item.children.filter(allowed);
    return children.length ? [{ ...item, children }] : [];
  });
}

/**
 * One level of a menu in the order a shop asked for: the arranged order first, then anything
 * this build has that the arrangement predates.
 *
 * Appending the unrecognised ones is the whole forward-compatibility story. A stored
 * arrangement is a list of keys written at some past version, so it will eventually be missing
 * an item (a screen shipped since) and holding one that is gone (a screen retired). Neither
 * may break a menu: the missing ones surface at the end where they can be moved, and the
 * departed ones fall out because nothing here matches them. A duplicate key — only reachable
 * from a hand-edited document — is taken once.
 */
function ordered<T extends { key: TranslationKey }>(
  items: readonly T[],
  saved: readonly MenuSetting[],
): T[] {
  const byKey = new Map(items.map((item) => [item.key as string, item]));
  const taken = new Set<string>();
  const out: T[] = [];

  for (const setting of saved) {
    const item = byKey.get(setting.key);
    if (item && !taken.has(setting.key)) {
      taken.add(setting.key);
      out.push(item);
    }
  }
  out.push(...items.filter((item) => !taken.has(item.key)));
  return out;
}

/** A shop's name for an item, or nothing — a blank override is not an override. */
function labelOf(setting: MenuSetting | undefined): string | undefined {
  return setting?.label?.trim() || undefined;
}

/**
 * The menu this shop has arranged: `nav` reordered, renamed, and marked up with what is
 * hidden. Every item is still here — hidden ones are flagged, not dropped, because the screen
 * that does the arranging has to show them to bring them back. The sidebar pipes the result
 * through {@link visible}; the settings screen uses it as it stands.
 *
 * Runs *after* `navFor`, never instead of it. Role decides what exists, the arrangement only
 * decides how what exists is presented — so no arrangement can hand anyone a screen their
 * role does not reach, whatever is in the stored document.
 */
export function mergeMenu(nav: readonly NavItem[], saved: readonly MenuSetting[] = []): NavItem[] {
  const byKey = new Map(saved.map((setting) => [setting.key, setting]));

  return ordered(nav, saved).map((item) => {
    const setting = byKey.get(item.key);
    const shown = { label: labelOf(setting), hidden: item.locked !== true && setting?.hidden === true };

    if (item.kind === 'link') {
      return { ...item, ...shown };
    }

    const childSettings = setting?.children ?? [];
    const childByKey = new Map(childSettings.map((child) => [child.key, child]));
    const children = ordered(item.children, childSettings).map((child) => {
      const childSetting = childByKey.get(child.key);
      return {
        ...child,
        label: labelOf(childSetting),
        hidden: child.locked !== true && childSetting?.hidden === true,
      };
    });
    return { ...item, ...shown, children };
  });
}

/**
 * What the sidebar actually draws: the arrangement minus everything hidden. A group whose
 * children are all hidden goes with them, the same way `navFor` drops one emptied by role —
 * a heading that opens onto nothing is worse than no heading.
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
