import { Routes } from '@angular/router';
import { authGuard, publicOnlyGuard } from './core/auth/auth.guard';
import { storeGuard } from './core/store/store.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'signup',
    canActivate: [publicOnlyGuard],
    loadComponent: () => import('./features/auth/signup/signup').then((m) => m.Signup),
  },
  {
    path: 'forgot-password',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  // No guard: a signed-up-but-unverified user still holds stored creds (would fail
  // publicOnlyGuard), yet must reach these to verify or resend.
  {
    path: 'verify-pending',
    loadComponent: () =>
      import('./features/auth/verify-pending/verify-pending').then((m) => m.VerifyPending),
  },
  {
    path: 'verify/:token',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email').then((m) => m.VerifyEmail),
  },
  // No guard: reached from an email link, user may or may not hold a stored session.
  {
    path: 'reset-password/:token',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: '',
    canActivate: [authGuard],
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
          {
            path: 'new-entry/sale',
            loadComponent: () => import('./features/new-entry/sale').then((m) => m.Sale),
          },
          {
            path: 'new-entry/receipt',
            loadComponent: () => import('./features/new-entry/receipt').then((m) => m.Receipt),
          },
          {
            path: 'new-entry/purchase',
            loadComponent: () => import('./features/new-entry/purchase').then((m) => m.Purchase),
          },
          {
            path: 'new-entry/expense',
            loadComponent: () => import('./features/new-entry/expense').then((m) => m.Expense),
          },
          {
            path: 'new-entry/payment',
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
