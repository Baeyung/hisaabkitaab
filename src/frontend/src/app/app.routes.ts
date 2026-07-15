import { Routes } from '@angular/router';
import { authGuard, publicOnlyGuard } from './core/auth/auth.guard';

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
  {
    path: '',
    canActivate: [authGuard],
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
        path: 'settings/general',
        loadComponent: () => import('./features/settings/general').then((m) => m.SettingsGeneral),
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
  { path: '**', redirectTo: '' },
];
