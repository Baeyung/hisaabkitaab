import { Routes } from '@angular/router';
import { authGuard, publicOnlyGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: 'users',
        loadComponent: () => import('./features/user-access/user-access').then((m) => m.UserAccess),
      },
      { path: '', pathMatch: 'full', redirectTo: 'users' },
    ],
  },
  { path: '**', redirectTo: '' },
];
