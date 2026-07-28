import { Routes } from '@angular/router';
import { authGuard, publicOnlyGuard } from './core/auth/auth.guard';
import { apexAppRedirectGuard, apexRedirectGuard } from './core/auth/apex.guard';
import { storeGuard } from './core/store/store.guard';

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
  {
    path: '',
    canActivate: [apexRedirectGuard, authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      // Outside storeGuard: with no store yet this is where the guard sends the
      // user, and it's where they create one.
      {
        path: 'settings/general',
        loadComponent: () => import('./features/settings/general').then((m) => m.SettingsGeneral),
      },
      {
        path: '',
        canActivateChild: [storeGuard],
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
            loadComponent: () => import('./features/new-entry/sale').then((m) => m.Sale),
          },
          {
            path: 'new-entry/sale/:entryId',
            loadComponent: () => import('./features/new-entry/sale').then((m) => m.Sale),
          },
          {
            path: 'new-entry/receipt',
            loadComponent: () => import('./features/new-entry/receipt').then((m) => m.Receipt),
          },
          {
            path: 'new-entry/receipt/:entryId',
            loadComponent: () => import('./features/new-entry/receipt').then((m) => m.Receipt),
          },
          {
            path: 'new-entry/purchase',
            loadComponent: () => import('./features/new-entry/purchase').then((m) => m.Purchase),
          },
          {
            path: 'new-entry/purchase/:entryId',
            loadComponent: () => import('./features/new-entry/purchase').then((m) => m.Purchase),
          },
          {
            path: 'new-entry/expense',
            loadComponent: () => import('./features/new-entry/expense').then((m) => m.Expense),
          },
          {
            path: 'new-entry/expense/:entryId',
            loadComponent: () => import('./features/new-entry/expense').then((m) => m.Expense),
          },
          {
            path: 'new-entry/payment',
            loadComponent: () => import('./features/new-entry/payment').then((m) => m.Payment),
          },
          {
            path: 'new-entry/payment/:entryId',
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
            loadComponent: () => import('./features/settings/items').then((m) => m.SettingsItems),
          },
          {
            path: 'settings/party',
            loadComponent: () => import('./features/settings/party').then((m) => m.SettingsParty),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
