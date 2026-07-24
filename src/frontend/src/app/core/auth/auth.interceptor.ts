import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth.store';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AuthStore);
  const router = inject(Router);

  const isApi = req.url.startsWith(environment.apiUrl);
  const isSignup = req.method === 'POST' && req.url.endsWith('/auth/signup');
  const creds = store.credentials();

  let authReq = req;
  if (isApi && !isSignup && creds && !req.headers.has('Authorization')) {
    authReq = req.clone({ setHeaders: { Authorization: `Basic ${creds}` } });
  }

  return next(authReq).pipe(
    catchError((err) => {
      if (err.status === 403 && err.error?.error === 'ACCOUNT_UNVERIFIED') {
        // Authenticated but unverified: hold them on the verification screen, keep creds
        // so they land straight in the app once verified.
        router.navigate(['/verify-pending']);
      } else if (err.status === 401) {
        store.clear();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
