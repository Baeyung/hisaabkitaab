import { Routes } from '@angular/router';
import { authGuard, publicOnlyGuard } from './core/auth/auth.guard';
import { apexAppRedirectGuard, apexRedirectGuard } from './core/auth/apex.guard';
import { editorGuard, ownerGuard, storeGuard } from './core/store/store.guard';

export const routes: Routes = [
  // Public marketing/landing page. No guard: reachable signed-out.
  {
    path: 'info',
    loadComponent: () => import('./features/info/info').then((m) => m.Info),
  },
  // Public policy pages. One component, `doc` bound from route data selects
  // which Markdown file (shipped as an asset) to render.
  {
    path: 'privacy-policy',
    data: { doc: 'privacy-policy' },
    loadComponent: () => import('./features/policy/policy').then((m) => m.Policy),
  },
  {
    path: 'terms-and-conditions',
    data: { doc: 'terms-and-conditions' },
    loadComponent: () => import('./features/policy/policy').then((m) => m.Policy),
  },
  {
    path: 'login',
    canActivate: [apexAppRedirectGuard, publicOnlyGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'signup',
    canActivate: [apexAppRedirectGuard, publicOnlyGuard],
    loadComponent: () => import('./features/auth/signup/signup').then((m) => m.Signup),
  },
  {
    path: 'forgot-password',
    canActivate: [apexAppRedirectGuard, publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  // No guard: a signed-up-but-unverified user still holds stored creds (would fail
  // publicOnlyGuard), yet must reach this to enter their code or resend it.
  {
    path: 'verify-pending',
    loadComponent: () =>
      import('./features/auth/verify-pending/verify-pending').then((m) => m.VerifyPending),
  },
  // Every shop the user owns. Always the landing screen after signing in: a store
  // has to be chosen before anything is scoped, and this is also the way between
  // shops. With none yet, it doubles as the create-your-first-store screen.
  // Opening a shop, section by section. It spans two routes because the first
  // section is what produces the id the rest are scoped by: `/stores/new` writes
  // the shop, then it hands off (replacing history) to `/s/:storeId/setup`, where
  // storeGuard has selected the store and the item/party APIs work as they do
  // everywhere else. Both sit outside the shell — there is nothing to navigate
  // to yet, and the wizard carries its own frame. Declared ahead of the routes
  // they extend so the longer path is matched before the shorter prefix.
  {
    path: 'stores/new',
    canActivate: [apexRedirectGuard, authGuard],
    loadComponent: () => import('./features/stores/store-setup').then((m) => m.StoreSetup),
  },
  {
    path: 's/:storeId/setup',
    canActivate: [apexRedirectGuard, authGuard, storeGuard, editorGuard],
    loadComponent: () => import('./features/stores/store-setup').then((m) => m.StoreSetup),
  },
  {
    path: 'stores',
    canActivate: [apexRedirectGuard, authGuard],
    loadComponent: () => import('./features/stores/store-picker').then((m) => m.StorePicker),
  },
  // The app proper, always inside one store. The id in the path is what scopes every
  // API call (StoreService.api) and every in-app link (StoreService.link), so two tabs
  // can sit in two different shops and a deep link carries its shop with it.
  {
    path: 's/:storeId',
    canActivate: [apexRedirectGuard, authGuard, storeGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'cashbook',
        loadComponent: () => import('./features/cashbook/cashbook').then((m) => m.Cashbook),
      },
      {
        path: 'ledger',
        loadComponent: () => import('./features/ledger/ledger').then((m) => m.Ledger),
      },
      {
        path: 'ledger/category/:key',
        loadComponent: () => import('./features/ledger/category-detail').then((m) => m.CategoryDetail),
      },
      {
        path: 'ledger/:partyId',
        loadComponent: () => import('./features/ledger/ledger-detail').then((m) => m.LedgerDetail),
      },
      // Each entry screen doubles as its own editor: with an :entryId it loads
      // that entry and saves as an update instead of a new record.
      {
        path: 'new-entry/sale',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/sale').then((m) => m.Sale),
      },
      {
        path: 'new-entry/sale/:entryId',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/sale').then((m) => m.Sale),
      },
      {
        path: 'new-entry/receipt',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/receipt').then((m) => m.Receipt),
      },
      {
        path: 'new-entry/receipt/:entryId',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/receipt').then((m) => m.Receipt),
      },
      {
        path: 'new-entry/purchase',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/purchase').then((m) => m.Purchase),
      },
      {
        path: 'new-entry/purchase/:entryId',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/purchase').then((m) => m.Purchase),
      },
      {
        path: 'new-entry/expense',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/expense').then((m) => m.Expense),
      },
      {
        path: 'new-entry/expense/:entryId',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/expense').then((m) => m.Expense),
      },
      {
        path: 'new-entry/payment',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/payment').then((m) => m.Payment),
      },
      {
        path: 'new-entry/payment/:entryId',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/new-entry/payment').then((m) => m.Payment),
      },
      {
        path: 'inventory',
        loadComponent: () => import('./features/inventory/inventory').then((m) => m.Inventory),
      },
      {
        path: 'inventory/:itemId',
        loadComponent: () =>
          import('./features/inventory/inventory-detail').then((m) => m.InventoryDetail),
      },
      {
        path: 'bill-management',
        loadComponent: () =>
          import('./features/bill-management/bill-management').then((m) => m.BillManagement),
      },
      {
        path: 'bill-management/:billId',
        loadComponent: () =>
          import('./features/bill-management/bill-detail').then((m) => m.BillDetail),
      },
      {
        path: 'settings/items',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/settings/items').then((m) => m.SettingsItems),
      },
      {
        path: 'settings/party',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/settings/party').then((m) => m.SettingsParty),
      },
      {
        path: 'settings/users',
        canActivate: [ownerGuard],
        loadComponent: () => import('./features/settings/users').then((m) => m.SettingsUsers),
      },
      {
        path: 'settings/general',
        canActivate: [editorGuard],
        loadComponent: () => import('./features/settings/general').then((m) => m.SettingsGeneral),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'stores' },
  { path: '**', redirectTo: 'stores' },
];
