import { TranslationKey } from '../../core/i18n/translations/en';
import { StoreRole } from '../../core/store/store.models';

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
    children: [
      // Editors get in for the opening drawer balance; the rest of the page is
      // read-only for them (see SettingsGeneral). No `writes`: a closed shop keeps this
      // screen, which is where its owner deletes it.
      { key: 'nav.settings.general', path: 'settings/general', requires: 'EDITOR' },
      // The shop's people are the owner's alone — and freeing a seat is one way out of an
      // overage, so this stays open on a closed shop too.
      { key: 'nav.settings.users', path: 'settings/users', requires: 'OWNER' },
      { key: 'nav.settings.items', path: 'settings/items', requires: 'EDITOR', writes: true },
      { key: 'nav.settings.party', path: 'settings/party', requires: 'EDITOR', writes: true },
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
