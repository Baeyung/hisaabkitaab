import { TranslationKey } from '../../core/i18n/translations/en';

export type NavIcon = 'dashboard' | 'cashbook' | 'ledger' | 'entry' | 'stock' | 'bill' | 'settings';

export interface NavLeaf {
  key: TranslationKey;
  /** Relative to the current store — the shell prefixes it via StoreService.link. */
  path: string;
}

export interface NavLink extends NavLeaf {
  kind: 'link';
  icon: NavIcon;
}

export interface NavGroup {
  kind: 'group';
  key: TranslationKey;
  icon: NavIcon;
  children: NavLeaf[];
}

export type NavItem = NavLink | NavGroup;

// Paths are store-relative: the shell renders each through StoreService.link, which
// puts the current store in front. Nothing here is gated any more — the whole menu
// lives inside /s/:storeId, where a store always exists by definition.
export const NAV: NavItem[] = [
  { kind: 'link', key: 'nav.dashboard', path: 'dashboard', icon: 'dashboard' },
  { kind: 'link', key: 'nav.cashbook', path: 'cashbook', icon: 'cashbook' },
  { kind: 'link', key: 'nav.ledger', path: 'ledger', icon: 'ledger' },
  { kind: 'link', key: 'nav.inventory', path: 'inventory', icon: 'stock' },
  { kind: 'link', key: 'nav.billManagement', path: 'bill-management', icon: 'bill' },
  {
    kind: 'group',
    key: 'nav.newEntry',
    icon: 'entry',
    children: [
      { key: 'nav.sale', path: 'new-entry/sale' },
      { key: 'nav.receipt', path: 'new-entry/receipt' },
      { key: 'nav.purchase', path: 'new-entry/purchase' },
      { key: 'nav.expense', path: 'new-entry/expense' },
      { key: 'nav.payment', path: 'new-entry/payment' },
    ],
  },
  {
    kind: 'group',
    key: 'nav.settings',
    icon: 'settings',
    children: [
      { key: 'nav.settings.general', path: 'settings/general' },
      { key: 'nav.settings.items', path: 'settings/items' },
      { key: 'nav.settings.party', path: 'settings/party' },
    ],
  },
];
