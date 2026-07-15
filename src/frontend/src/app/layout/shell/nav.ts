import { TranslationKey } from '../../core/i18n/translations/en';

export type NavIcon = 'dashboard' | 'cashbook' | 'ledger' | 'entry' | 'stock' | 'bill' | 'settings';

export interface NavLeaf {
  key: TranslationKey;
  path: string;
  locked?: boolean;
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

export const NAV: NavItem[] = [
  { kind: 'link', key: 'nav.dashboard', path: '/dashboard', icon: 'dashboard' },
  { kind: 'link', key: 'nav.cashbook', path: '/cashbook', icon: 'cashbook' },
  { kind: 'link', key: 'nav.ledger', path: '/ledger', icon: 'ledger' },
  { kind: 'link', key: 'nav.inventory', path: '/inventory', icon: 'stock' },
  { kind: 'link', key: 'nav.billManagement', path: '/bill-management', icon: 'bill' },
  {
    kind: 'group',
    key: 'nav.newEntry',
    icon: 'entry',
    children: [
      { key: 'nav.sale', path: '/new-entry/sale' },
      { key: 'nav.receipt', path: '/new-entry/receipt' },
      { key: 'nav.purchase', path: '/new-entry/purchase' },
      { key: 'nav.expense', path: '/new-entry/expense' },
      { key: 'nav.payment', path: '/new-entry/payment' },
    ],
  },
  {
    kind: 'group',
    key: 'nav.settings',
    icon: 'settings',
    children: [
      { key: 'nav.settings.general', path: '/settings/general' },
      // `locked` = gated behind having a store; the shell resolves it live
      // against StoreService.hasStore() (see Shell.isLocked).
      { key: 'nav.settings.items', path: '/settings/items', locked: true },
      { key: 'nav.settings.party', path: '/settings/party', locked: true },
    ],
  },
];
