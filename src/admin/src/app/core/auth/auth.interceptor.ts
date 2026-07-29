import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth.store';
import { environment } from '../../../environments/environment';

/**
 * Attaches the stored Basic credentials to every API call, and drops the session on a 401.
 * A 403 is left alone: it means the account is real but no longer an admin, and the login
 * screen is what interprets that.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AuthStore);
  const router = inject(Router);

  const creds = store.credentials();
  const authReq =
    req.url.startsWith(environment.apiUrl) && creds && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Basic ${creds}` } })
      : req;

  return next(authReq).pipe(
    catchError((err) => {
      if (err.status === 401) {
        store.clear();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
