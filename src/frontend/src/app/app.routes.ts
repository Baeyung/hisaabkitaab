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
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  { path: '**', redirectTo: '' },
];
