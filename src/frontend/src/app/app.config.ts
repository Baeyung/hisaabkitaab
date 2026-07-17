import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Input binding lets detail routes (/ledger/:partyId etc.) bind params
    // straight into input.required<string>() — no ActivatedRoute plumbing.
    provideRouter(routes, withViewTransitions(), withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // No providePrimeNG: no component uses PrimeNG, and an empty license key
    // paints an "Invalid PrimeUI License" watermark on every screen. Add it
    // back (with a real key) when a PrimeNG component is actually introduced.
  ],
};
