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

// `locked` marks the leaves that storeGuard gates (app.routes.ts) — everything
// but Settings › General. The shell resolves it live against
// StoreService.hasStore() (see Shell.isLocked), so the menu shows what the
// router would actually allow instead of bouncing the user to the store page.
// Keep these two in step: a route behind storeGuard should be `locked` here.
export const NAV: NavItem[] = [
  { kind: 'link', key: 'nav.dashboard', path: '/dashboard', icon: 'dashboard', locked: true },
  { kind: 'link', key: 'nav.cashbook', path: '/cashbook', icon: 'cashbook', locked: true },
  { kind: 'link', key: 'nav.ledger', path: '/ledger', icon: 'ledger', locked: true },
  { kind: 'link', key: 'nav.inventory', path: '/inventory', icon: 'stock', locked: true },
  {
    kind: 'link',
    key: 'nav.billManagement',
    path: '/bill-management',
    icon: 'bill',
    locked: true,
  },
  {
    kind: 'group',
    key: 'nav.newEntry',
    icon: 'entry',
    children: [
      { key: 'nav.sale', path: '/new-entry/sale', locked: true },
      { key: 'nav.receipt', path: '/new-entry/receipt', locked: true },
      { key: 'nav.purchase', path: '/new-entry/purchase', locked: true },
      { key: 'nav.expense', path: '/new-entry/expense', locked: true },
      { key: 'nav.payment', path: '/new-entry/payment', locked: true },
    ],
  },
  {
    kind: 'group',
    key: 'nav.settings',
    icon: 'settings',
    children: [
      { key: 'nav.settings.general', path: '/settings/general' },
      { key: 'nav.settings.items', path: '/settings/items', locked: true },
      { key: 'nav.settings.party', path: '/settings/party', locked: true },
    ],
  },
];
