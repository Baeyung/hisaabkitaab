# Login / Signup + Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shopkeeper can sign up, log in, and land on a guarded bilingual (EN/UR, RTL) home page, with HTTP Basic credentials attached to every API call, against the existing Spring Boot backend.

**Architecture:** Angular v22 standalone + signals frontend. A signal-based `AuthStore` holds base64 credentials (persisted to `localStorage`); a functional interceptor attaches the `Authorization` header and handles global 401; functional guards protect routes. A home-grown signal-based `LocaleService` drives runtime EN⇄UR switching and RTL. Backend gets CORS, a custom `AuthenticationEntryPoint` (no `WWW-Authenticate`, so no native browser popup), and a 409 duplicate-signup handler.

**Tech Stack:** Angular v22 (standalone, signals, Signal Forms), PrimeNG 22, Tailwind v4, TypeScript; Spring Boot (Java, Spring Security HTTP Basic), PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-07-15-auth-login-signup-design.md`

## Global Constraints

- **No automated tests this slice** — verification is manual (curl / build / browser drive). Tests come with MVP.
- **Angular:** standalone components only; do NOT set `standalone: true` or `changeDetection: OnPush` (both are defaults in v22). Use `inject()`, `input()`/`output()`, `signal()`/`computed()`, native control flow (`@if`/`@for`), `class`/`style` bindings (never `ngClass`/`ngStyle`), host bindings via the `host` object. Prefer **Signal Forms** (`@angular/forms/signals`).
- **Signal Forms note:** the API (`form`, `Control`, `required`, `email`) is new; the frontend build step in each screen task will surface any import/signature mismatch against the installed version — adjust names to match `@angular/forms/signals` as installed if the build fails.
- **Services:** singletons use `@Injectable({ providedIn: 'root' })` (CLAUDE.md notes a `@Service` preference — use it only if it exists in the installed version; otherwise `@Injectable`).
- **Credentials:** base64 `identifier:password` in `localStorage` under key `hk.auth.creds`; cleared on any 401 and on logout.
- **Locale:** persisted in `localStorage` under key `hk.locale`; default `en`.
- **API base:** `environment.apiUrl` (`http://localhost:8080/api` in dev). Never hardcode the URL in components/services.
- **Urdu face:** Noto Nastaliq Urdu; apply generous `line-height` and avoid tight fixed-height inputs.
- **BE dev origin:** `http://localhost:4200` only.

---

## File Structure

**Frontend (create unless noted):**
- `src/environments/environment.ts` — prod placeholder apiUrl
- `src/environments/environment.development.ts` — dev apiUrl
- `src/app/app.config.ts` *(modify)* — add `provideHttpClient(withInterceptors([authInterceptor]))`
- `src/app/app.ts`, `src/app/app.html` *(modify)* — reduce to `<router-outlet />`
- `src/app/app.routes.ts` *(modify)* — real routes
- `src/app/core/auth/auth.models.ts`
- `src/app/core/auth/auth.store.ts`
- `src/app/core/auth/auth.service.ts`
- `src/app/core/auth/auth.interceptor.ts`
- `src/app/core/auth/auth.guard.ts`
- `src/app/core/i18n/locale.service.ts`
- `src/app/core/i18n/translations/en.ts`
- `src/app/core/i18n/translations/ur.ts`
- `src/app/shared/language-toggle/language-toggle.ts`
- `src/app/features/auth/login/login.ts` + `login.html`
- `src/app/features/auth/signup/signup.ts` + `signup.html`
- `src/app/features/home/home.ts`
- `src/styles.css` *(modify)* — Urdu font + RTL base
- `angular.json` *(modify)* — dev fileReplacements

**Backend (modify):**
- `.../config/SecurityConfig.java`
- `.../security/RestAuthenticationEntryPoint.java` *(create)*
- `.../exception/GlobalExceptionHandler.java`

---

## Task 1: Backend — CORS + no-popup authentication entry point

**Files:**
- Create: `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/security/RestAuthenticationEntryPoint.java`
- Modify: `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/config/SecurityConfig.java`

**Interfaces:**
- Produces: a running backend that (a) accepts cross-origin calls from `http://localhost:4200`, (b) returns `401` with **no `WWW-Authenticate` header** on bad/missing Basic creds.

- [ ] **Step 1: Create the entry point**

`RestAuthenticationEntryPoint.java`:
```java
package io.github.baeyung.hisaabkitaab.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Returns 401 without a {@code WWW-Authenticate} header so browsers never show
 * the native Basic-auth popup on a failed programmatic login from the SPA.
 */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint
{
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException
    {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"status\":401,\"error\":\"Unauthorized\",\"message\":\"Invalid credentials\"}");
    }
}
```

- [ ] **Step 2: Wire CORS + entry point into `SecurityConfig`**

Replace the `filterChain` body and add a `CorsConfigurationSource` bean. The class now takes the entry point via constructor:
```java
package io.github.baeyung.hisaabkitaab.config;

import io.github.baeyung.hisaabkitaab.security.RestAuthenticationEntryPoint;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig
{
    private final RestAuthenticationEntryPoint authenticationEntryPoint;

    public SecurityConfig(RestAuthenticationEntryPoint authenticationEntryPoint)
    {
        this.authenticationEntryPoint = authenticationEntryPoint;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception
    {
        http
                .cors(cors -> {})
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/auth/signup").permitAll()
                        .anyRequest().authenticated())
                .httpBasic(basic -> basic.authenticationEntryPoint(authenticationEntryPoint))
                .exceptionHandling(ex -> ex.authenticationEntryPoint(authenticationEntryPoint));

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource()
    {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:4200"));
        config.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
```

- [ ] **Step 3: Build the backend**

Run: `cd src/backend && ./mvnw -q compile`
Expected: BUILD SUCCESS (no compile errors).

- [ ] **Step 4: Start the backend and verify behavior with curl**

Start (background): `cd src/backend && ./mvnw spring-boot:run`
Then in another shell:
```bash
# CORS preflight allowed
curl -i -X OPTIONS http://localhost:8080/api/auth/me \
  -H "Origin: http://localhost:4200" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"

# Bad creds -> 401 with NO www-authenticate header
curl -i http://localhost:8080/api/auth/me -u wrong:creds
```
Expected: preflight returns `200` with `Access-Control-Allow-Origin: http://localhost:4200`; the second returns `401` and the response headers contain **no** `WWW-Authenticate:` line.

- [ ] **Step 5: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/security/RestAuthenticationEntryPoint.java src/backend/src/main/java/io/github/baeyung/hisaabkitaab/config/SecurityConfig.java
git commit -m "adding CORS and popup-free 401 entry point for SPA auth"
```

---

## Task 2: Backend — 409 duplicate-signup handler

**Files:**
- Modify: `src/backend/src/main/java/io/github/baeyung/hisaabkitaab/exception/GlobalExceptionHandler.java`

**Interfaces:**
- Produces: signup with an existing `contactNumber`/`email` returns `409` with an `ApiError` body instead of a `500`.

- [ ] **Step 1: Add the handler**

Add these imports to `GlobalExceptionHandler.java`:
```java
import org.springframework.dao.DataIntegrityViolationException;
```
And add this handler method inside the class (above `handleGeneric`):
```java
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDuplicate(DataIntegrityViolationException ex, WebRequest request)
    {
        return build(HttpStatus.CONFLICT, "Account already exists", request, null);
    }
```

- [ ] **Step 2: Build the backend**

Run: `cd src/backend && ./mvnw -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Verify with curl (backend running)**

```bash
# First signup (may already exist from earlier runs — that's fine)
curl -s -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Dup Test","contactNumber":"03009998887","email":"dup@example.com","password":"secret123"}'

# Second identical signup -> 409
curl -i -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Dup Test","contactNumber":"03009998887","email":"dup@example.com","password":"secret123"}'
```
Expected: the second call returns `409` with a JSON `ApiError` (`"status":409,"message":"Account already exists"`).

- [ ] **Step 4: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/backend/src/main/java/io/github/baeyung/hisaabkitaab/exception/GlobalExceptionHandler.java
git commit -m "returning 409 on duplicate signup instead of 500"
```

---

## Task 3: Frontend — environments, HttpClient, app shell

**Files:**
- Create: `src/frontend/src/environments/environment.ts`, `src/frontend/src/environments/environment.development.ts`
- Modify: `src/frontend/angular.json`, `src/frontend/src/app/app.config.ts`, `src/frontend/src/app/app.ts`, `src/frontend/src/app/app.html`

**Interfaces:**
- Produces: `environment.apiUrl` (string), `provideHttpClient` wired with an (about to be created) `authInterceptor`, and a shell whose template is only `<router-outlet />`.

- [ ] **Step 1: Create environment files**

`src/environments/environment.ts`:
```ts
export const environment = {
  production: true,
  apiUrl: '/api',
};
```
`src/environments/environment.development.ts`:
```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api',
};
```

- [ ] **Step 2: Add dev fileReplacements to `angular.json`**

In `angular.json`, under `projects → hisaabkitaab → architect → build → configurations → development`, add a `fileReplacements` entry so it becomes:
```json
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true,
              "fileReplacements": [
                {
                  "replace": "src/environments/environment.ts",
                  "with": "src/environments/environment.development.ts"
                }
              ]
            }
```

- [ ] **Step 3: Reduce the app shell**

`src/app/app.ts`:
```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
```
`src/app/app.html`:
```html
<router-outlet />
```

- [ ] **Step 4: Wire HttpClient + interceptor in `app.config.ts`**

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    providePrimeNG({
      theme: { preset: Aura },
      license: '',
    }),
  ],
};
```
> This references `authInterceptor` (Task 7) and the new `routes` (Task 8). The build in Step 5 will fail until those exist — that is expected; run the build only after Task 8, OR temporarily comment the interceptor import until Task 7. Recommended execution order: do Tasks 3→8 before building the frontend, since these foundational modules only compile together.

- [ ] **Step 5: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/frontend/src/environments src/frontend/angular.json src/frontend/src/app/app.config.ts src/frontend/src/app/app.ts src/frontend/src/app/app.html
git commit -m "adding environments, HttpClient wiring, and minimal app shell"
```

---

## Task 4: Frontend — i18n (LocaleService, translations, font, toggle)

**Files:**
- Create: `src/frontend/src/app/core/i18n/translations/en.ts`, `.../translations/ur.ts`, `.../locale.service.ts`, `src/frontend/src/app/shared/language-toggle/language-toggle.ts`
- Modify: `src/frontend/src/styles.css`

**Interfaces:**
- Produces:
  - `LocaleService` with: `locale` (readonly signal `'en'|'ur'`), `dir` (computed `'rtl'|'ltr'`), `setLocale(l)`, `toggle()`, `t(key, params?)`, `formatNumber(n)`.
  - `TranslationKey` type (union of all keys).
  - `LanguageToggle` standalone component, selector `app-language-toggle`.

- [ ] **Step 1: English dictionary (source of truth for keys)**

`src/app/core/i18n/translations/en.ts`:
```ts
export const en = {
  'app.name': 'HisaabKitaab',
  'auth.login.title': 'Log in',
  'auth.login.identifier': 'Email or phone number',
  'auth.login.password': 'Password',
  'auth.login.submit': 'Log in',
  'auth.login.toSignup': 'Create an account',
  'auth.login.invalid': 'Invalid credentials',
  'auth.signup.title': 'Create account',
  'auth.signup.name': 'Name',
  'auth.signup.contact': 'Phone number',
  'auth.signup.email': 'Email',
  'auth.signup.password': 'Password',
  'auth.signup.submit': 'Sign up',
  'auth.signup.toLogin': 'I already have an account',
  'auth.signup.exists': 'An account with these details already exists',
  'validation.required': 'This field is required',
  'validation.email': 'Enter a valid email',
  'error.generic': 'Something went wrong. Please try again.',
  'home.welcome': 'Welcome, {{name}}',
  'home.logout': 'Log out',
  'lang.toggle': 'اردو',
} as const;

export type TranslationKey = keyof typeof en;
```

- [ ] **Step 2: Urdu dictionary (same keys, enforced by type)**

`src/app/core/i18n/translations/ur.ts`:
```ts
import { TranslationKey } from './en';

export const ur: Record<TranslationKey, string> = {
  'app.name': 'حساب کتاب',
  'auth.login.title': 'لاگ اِن کریں',
  'auth.login.identifier': 'ای میل یا فون نمبر',
  'auth.login.password': 'پاس ورڈ',
  'auth.login.submit': 'لاگ اِن',
  'auth.login.toSignup': 'نیا اکاؤنٹ بنائیں',
  'auth.login.invalid': 'غلط تفصیلات',
  'auth.signup.title': 'اکاؤنٹ بنائیں',
  'auth.signup.name': 'نام',
  'auth.signup.contact': 'فون نمبر',
  'auth.signup.email': 'ای میل',
  'auth.signup.password': 'پاس ورڈ',
  'auth.signup.submit': 'رجسٹر کریں',
  'auth.signup.toLogin': 'میرا اکاؤنٹ پہلے سے موجود ہے',
  'auth.signup.exists': 'ان تفصیلات کے ساتھ اکاؤنٹ پہلے سے موجود ہے',
  'validation.required': 'یہ خانہ ضروری ہے',
  'validation.email': 'درست ای میل درج کریں',
  'error.generic': 'کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔',
  'home.welcome': 'خوش آمدید، {{name}}',
  'home.logout': 'لاگ آؤٹ',
  'lang.toggle': 'English',
};
```

- [ ] **Step 3: LocaleService**

`src/app/core/i18n/locale.service.ts`:
```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { en, TranslationKey } from './translations/en';
import { ur } from './translations/ur';

type Locale = 'en' | 'ur';
const LOCALE_KEY = 'hk.locale';
const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, ur };
const easternDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly _locale = signal<Locale>(
    (localStorage.getItem(LOCALE_KEY) as Locale | null) ?? 'en',
  );

  readonly locale = this._locale.asReadonly();
  readonly dir = computed<'rtl' | 'ltr'>(() => (this._locale() === 'ur' ? 'rtl' : 'ltr'));

  constructor() {
    effect(() => {
      const el = this.document.documentElement;
      el.lang = this._locale();
      el.dir = this.dir();
    });
  }

  setLocale(locale: Locale): void {
    localStorage.setItem(LOCALE_KEY, locale);
    this._locale.set(locale);
  }

  toggle(): void {
    this.setLocale(this._locale() === 'en' ? 'ur' : 'en');
  }

  t(key: TranslationKey, params?: Record<string, string>): string {
    let value = dictionaries[this._locale()][key];
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{{${k}}}`, v);
      }
    }
    return value;
  }

  formatNumber(n: number): string {
    const s = String(n);
    return this._locale() === 'ur' ? s.replace(/\d/g, (d) => easternDigits[Number(d)]) : s;
  }
}
```

- [ ] **Step 4: LanguageToggle component**

`src/app/shared/language-toggle/language-toggle.ts`:
```ts
import { Component, inject } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';

@Component({
  selector: 'app-language-toggle',
  template: `
    <button type="button" class="lang-toggle" (click)="locale.toggle()">
      {{ locale.t('lang.toggle') }}
    </button>
  `,
  styles: `
    .lang-toggle {
      min-height: 44px;
      padding-inline: 1rem;
      background: transparent;
      border: 1px solid currentColor;
      border-radius: 0.5rem;
      cursor: pointer;
      font-size: 1rem;
    }
  `,
})
export class LanguageToggle {
  protected readonly locale = inject(LocaleService);
}
```

- [ ] **Step 5: Urdu font + RTL base in `styles.css`**

Prepend to `src/styles.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap');

html {
  font-size: 16px;
}

html[dir='rtl'] {
  font-family: 'Noto Nastaliq Urdu', system-ui, sans-serif;
  line-height: 2.2;
}
```

- [ ] **Step 6: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/frontend/src/app/core/i18n src/frontend/src/app/shared/language-toggle src/frontend/src/styles.css
git commit -m "adding signal-based i18n, EN/UR dictionaries, language toggle, and Urdu font"
```

---

## Task 5: Frontend — auth models + store

**Files:**
- Create: `src/frontend/src/app/core/auth/auth.models.ts`, `.../auth.store.ts`

**Interfaces:**
- Produces:
  - `User { id, contactNumber, name, email }`, `SignupRequest { name, contactNumber, email, password }`, `ApiError { status, error, message, path, fieldErrors? }`.
  - `AuthStore` (`providedIn: 'root'`): `credentials` (readonly signal `string|null`), `currentUser` (readonly signal `User|null`), `isAuthenticated` (computed `boolean`), `setSession(credentials: string, user: User)`, `setUser(user: User)`, `clear()`.

- [ ] **Step 1: Models**

`src/app/core/auth/auth.models.ts`:
```ts
export interface User {
  id: string;
  contactNumber: string;
  name: string;
  email: string;
}

export interface SignupRequest {
  name: string;
  contactNumber: string;
  email: string;
  password: string;
}

export interface ApiError {
  status: number;
  error: string;
  message: string;
  path: string;
  fieldErrors?: Record<string, string> | null;
}
```

- [ ] **Step 2: Store**

`src/app/core/auth/auth.store.ts`:
```ts
import { Injectable, computed, signal } from '@angular/core';
import { User } from './auth.models';

const CREDS_KEY = 'hk.auth.creds';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _credentials = signal<string | null>(localStorage.getItem(CREDS_KEY));
  private readonly _currentUser = signal<User | null>(null);

  readonly credentials = this._credentials.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this._credentials() !== null);

  setSession(credentials: string, user: User): void {
    localStorage.setItem(CREDS_KEY, credentials);
    this._credentials.set(credentials);
    this._currentUser.set(user);
  }

  setUser(user: User): void {
    this._currentUser.set(user);
  }

  clear(): void {
    localStorage.removeItem(CREDS_KEY);
    this._credentials.set(null);
    this._currentUser.set(null);
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/frontend/src/app/core/auth/auth.models.ts src/frontend/src/app/core/auth/auth.store.ts
git commit -m "adding auth models and signal-based auth store with localStorage persistence"
```

---

## Task 6: Frontend — auth service

**Files:**
- Create: `src/frontend/src/app/core/auth/auth.service.ts`

**Interfaces:**
- Consumes: `AuthStore.setSession/clear`, `environment.apiUrl`, `SignupRequest`, `User`.
- Produces: `AuthService` (`providedIn: 'root'`): `signup(req: SignupRequest): Promise<User>`, `login(identifier: string, password: string): Promise<User>`, `logout(): void`.

- [ ] **Step 1: Service**

`src/app/core/auth/auth.service.ts`:
```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';
import { SignupRequest, User } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);
  private readonly apiUrl = environment.apiUrl;

  async signup(req: SignupRequest): Promise<User> {
    const user = await firstValueFrom(
      this.http.post<User>(`${this.apiUrl}/auth/signup`, req),
    );
    const identifier = req.email?.trim() || req.contactNumber;
    this.store.setSession(btoa(`${identifier}:${req.password}`), user);
    return user;
  }

  async login(identifier: string, password: string): Promise<User> {
    const credentials = btoa(`${identifier}:${password}`);
    const user = await firstValueFrom(
      this.http.get<User>(`${this.apiUrl}/auth/me`, {
        headers: new HttpHeaders({ Authorization: `Basic ${credentials}` }),
      }),
    );
    this.store.setSession(credentials, user);
    return user;
  }

  logout(): void {
    this.store.clear();
  }
}
```
> The `login` call attaches its own `Authorization` header because the store is empty during login; the interceptor (Task 7) must not overwrite an existing header.

- [ ] **Step 2: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/frontend/src/app/core/auth/auth.service.ts
git commit -m "adding auth service for signup, login-via-me, and logout"
```

---

## Task 7: Frontend — auth interceptor

**Files:**
- Create: `src/frontend/src/app/core/auth/auth.interceptor.ts`

**Interfaces:**
- Consumes: `AuthStore.credentials/clear`, `environment.apiUrl`, `Router`.
- Produces: `authInterceptor: HttpInterceptorFn` (already referenced by `app.config.ts` in Task 3).

- [ ] **Step 1: Interceptor**

`src/app/core/auth/auth.interceptor.ts`:
```ts
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
      if (err.status === 401) {
        store.clear();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
```

- [ ] **Step 2: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/frontend/src/app/core/auth/auth.interceptor.ts
git commit -m "adding auth interceptor: attach Basic header and global 401 handling"
```

---

## Task 8: Frontend — guards, routes, home placeholder

**Files:**
- Create: `src/frontend/src/app/core/auth/auth.guard.ts`, `src/frontend/src/app/features/home/home.ts`
- Modify: `src/frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AuthStore.isAuthenticated`, `AuthService.logout`, `LocaleService`, `LanguageToggle`.
- Produces: `authGuard`, `publicOnlyGuard` (`CanActivateFn`); `Home` component; a `routes` array with `/login`, `/signup`, `/`, `**`.

- [ ] **Step 1: Guards**

`src/app/core/auth/auth.guard.ts`:
```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

export const authGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  return store.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

export const publicOnlyGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  return store.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
```

- [ ] **Step 2: Home placeholder**

`src/app/features/home/home.ts`:
```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/auth/auth.store';
import { LocaleService } from '../../core/i18n/locale.service';
import { LanguageToggle } from '../../shared/language-toggle/language-toggle';

@Component({
  selector: 'app-home',
  imports: [LanguageToggle],
  template: `
    <header style="display:flex; justify-content:flex-end; padding:1rem;">
      <app-language-toggle />
    </header>
    <main style="padding:2rem; text-align:center;">
      <h1>{{ locale.t('home.welcome', { name: store.currentUser()?.name ?? '' }) }}</h1>
      <button type="button" (click)="logout()" style="min-height:44px; margin-top:1rem;">
        {{ locale.t('home.logout') }}
      </button>
    </main>
  `,
})
export class Home {
  protected readonly store = inject(AuthStore);
  protected readonly locale = inject(LocaleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
```

- [ ] **Step 3: Routes**

`src/app/app.routes.ts`:
```ts
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
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  { path: '**', redirectTo: '' },
];
```
> `routes` references the Login/Signup components (Tasks 9–10). The frontend build is deferred to Task 10 Step 3, after those exist.

- [ ] **Step 4: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/frontend/src/app/core/auth/auth.guard.ts src/frontend/src/app/features/home/home.ts src/frontend/src/app/app.routes.ts
git commit -m "adding route guards, lazy routes, and placeholder home screen"
```

---

## Task 9: Frontend — login screen

**Files:**
- Create: `src/frontend/src/app/features/auth/login/login.ts`, `.../login.html`

**Interfaces:**
- Consumes: `AuthService.login`, `LocaleService`, `LanguageToggle`, Signal Forms.
- Produces: `Login` component (selector `app-login`).

- [ ] **Step 1: Component**

`src/app/features/auth/login/login.ts`:
```ts
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, Control, required } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { LocaleService } from '../../../core/i18n/locale.service';
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';

@Component({
  selector: 'app-login',
  imports: [Control, RouterLink, LanguageToggle],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly model = signal({ identifier: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.identifier);
    required(path.password);
  });

  protected readonly submitting = signal(false);
  protected readonly errorKey = signal<'auth.login.invalid' | 'error.generic' | null>(null);

  async submit(): Promise<void> {
    if (this.loginForm().invalid()) {
      return;
    }
    this.submitting.set(true);
    this.errorKey.set(null);
    try {
      const { identifier, password } = this.model();
      await this.auth.login(identifier, password);
      this.router.navigate(['/']);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      this.errorKey.set(status === 401 ? 'auth.login.invalid' : 'error.generic');
    } finally {
      this.submitting.set(false);
    }
  }
}
```

- [ ] **Step 2: Template**

`src/app/features/auth/login/login.html`:
```html
<div style="max-width:24rem; margin:3rem auto; padding:1.5rem;">
  <header style="display:flex; justify-content:space-between; align-items:center; margin-block-end:1.5rem;">
    <h1 style="font-size:1.5rem;">{{ locale.t('auth.login.title') }}</h1>
    <app-language-toggle />
  </header>

  <form (submit)="$event.preventDefault(); submit()">
    <label style="display:block; margin-block-end:1rem;">
      <span style="display:block; margin-block-end:0.25rem;">{{ locale.t('auth.login.identifier') }}</span>
      <input
        [control]="loginForm.identifier"
        type="text"
        autocomplete="username"
        style="width:100%; min-height:44px; font-size:1rem; padding-inline:0.75rem;"
      />
    </label>

    <label style="display:block; margin-block-end:1rem;">
      <span style="display:block; margin-block-end:0.25rem;">{{ locale.t('auth.login.password') }}</span>
      <input
        [control]="loginForm.password"
        type="password"
        autocomplete="current-password"
        style="width:100%; min-height:44px; font-size:1rem; padding-inline:0.75rem;"
      />
    </label>

    @if (errorKey(); as key) {
      <p role="alert" style="color:#b00020; margin-block-end:1rem;">{{ locale.t(key) }}</p>
    }

    <button
      type="submit"
      [disabled]="submitting()"
      style="width:100%; min-height:48px; font-size:1rem;"
    >
      {{ locale.t('auth.login.submit') }}
    </button>
  </form>

  <p style="margin-block-start:1.5rem; text-align:center;">
    <a routerLink="/signup">{{ locale.t('auth.login.toSignup') }}</a>
  </p>
</div>
```
> Signal Forms API check: if the build (Task 10 Step 3) reports that `form`, `Control`, `required`, or `[control]` don't match `@angular/forms/signals` as installed, align the names to the installed export surface (same concepts, possibly different identifiers).

- [ ] **Step 3: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/frontend/src/app/features/auth/login
git commit -m "adding bilingual login screen with signal forms"
```

---

## Task 10: Frontend — signup screen + full build & manual verification

**Files:**
- Create: `src/frontend/src/app/features/auth/signup/signup.ts`, `.../signup.html`

**Interfaces:**
- Consumes: `AuthService.signup`, `LocaleService`, `LanguageToggle`, `ApiError`, Signal Forms.
- Produces: `Signup` component (selector `app-signup`).

- [ ] **Step 1: Component**

`src/app/features/auth/signup/signup.ts`:
```ts
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, Control, required, email } from '@angular/forms/signals';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/auth/auth.models';
import { LocaleService } from '../../../core/i18n/locale.service';
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';

@Component({
  selector: 'app-signup',
  imports: [Control, RouterLink, LanguageToggle],
  templateUrl: './signup.html',
})
export class Signup {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly locale = inject(LocaleService);

  protected readonly model = signal({ name: '', contactNumber: '', email: '', password: '' });
  protected readonly signupForm = form(this.model, (path) => {
    required(path.name);
    required(path.contactNumber);
    required(path.password);
    email(path.email);
  });

  protected readonly submitting = signal(false);
  protected readonly serverFieldErrors = signal<Record<string, string>>({});
  protected readonly errorKey = signal<'auth.signup.exists' | 'error.generic' | null>(null);

  async submit(): Promise<void> {
    if (this.signupForm().invalid()) {
      return;
    }
    this.submitting.set(true);
    this.serverFieldErrors.set({});
    this.errorKey.set(null);
    try {
      await this.auth.signup(this.model());
      this.router.navigate(['/']);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const body = (err as { error?: ApiError }).error;
      if (status === 400 && body?.fieldErrors) {
        this.serverFieldErrors.set(body.fieldErrors);
      } else if (status === 409) {
        this.errorKey.set('auth.signup.exists');
      } else {
        this.errorKey.set('error.generic');
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
```

- [ ] **Step 2: Template**

`src/app/features/auth/signup/signup.html`:
```html
<div style="max-width:24rem; margin:3rem auto; padding:1.5rem;">
  <header style="display:flex; justify-content:space-between; align-items:center; margin-block-end:1.5rem;">
    <h1 style="font-size:1.5rem;">{{ locale.t('auth.signup.title') }}</h1>
    <app-language-toggle />
  </header>

  <form (submit)="$event.preventDefault(); submit()">
    <label style="display:block; margin-block-end:1rem;">
      <span style="display:block; margin-block-end:0.25rem;">{{ locale.t('auth.signup.name') }}</span>
      <input [control]="signupForm.name" type="text" autocomplete="name"
        style="width:100%; min-height:44px; font-size:1rem; padding-inline:0.75rem;" />
      @if (serverFieldErrors()['name']) {
        <span role="alert" style="color:#b00020;">{{ locale.t('validation.required') }}</span>
      }
    </label>

    <label style="display:block; margin-block-end:1rem;">
      <span style="display:block; margin-block-end:0.25rem;">{{ locale.t('auth.signup.contact') }}</span>
      <input [control]="signupForm.contactNumber" type="tel" autocomplete="tel"
        style="width:100%; min-height:44px; font-size:1rem; padding-inline:0.75rem;" />
      @if (serverFieldErrors()['contactNumber']) {
        <span role="alert" style="color:#b00020;">{{ locale.t('validation.required') }}</span>
      }
    </label>

    <label style="display:block; margin-block-end:1rem;">
      <span style="display:block; margin-block-end:0.25rem;">{{ locale.t('auth.signup.email') }}</span>
      <input [control]="signupForm.email" type="email" autocomplete="email"
        style="width:100%; min-height:44px; font-size:1rem; padding-inline:0.75rem;" />
      @if (serverFieldErrors()['email']) {
        <span role="alert" style="color:#b00020;">{{ locale.t('validation.email') }}</span>
      }
    </label>

    <label style="display:block; margin-block-end:1rem;">
      <span style="display:block; margin-block-end:0.25rem;">{{ locale.t('auth.signup.password') }}</span>
      <input [control]="signupForm.password" type="password" autocomplete="new-password"
        style="width:100%; min-height:44px; font-size:1rem; padding-inline:0.75rem;" />
      @if (serverFieldErrors()['password']) {
        <span role="alert" style="color:#b00020;">{{ locale.t('validation.required') }}</span>
      }
    </label>

    @if (errorKey(); as key) {
      <p role="alert" style="color:#b00020; margin-block-end:1rem;">{{ locale.t(key) }}</p>
    }

    <button type="submit" [disabled]="submitting()"
      style="width:100%; min-height:48px; font-size:1rem;">
      {{ locale.t('auth.signup.submit') }}
    </button>
  </form>

  <p style="margin-block-start:1.5rem; text-align:center;">
    <a routerLink="/login">{{ locale.t('auth.signup.toLogin') }}</a>
  </p>
</div>
```

- [ ] **Step 3: Build the whole frontend**

Run: `cd src/frontend && npm run build`
Expected: build succeeds. If it fails on `@angular/forms/signals` imports, reconcile the Signal Forms identifiers (`form`/`Control`/`required`/`email`/`[control]`/`.invalid()`) with the installed version's exports, then rebuild.

- [ ] **Step 4: Manual end-to-end verification (spec §10)**

Start backend (`cd src/backend && ./mvnw spring-boot:run`) and frontend (`cd src/frontend && npm start`), open `http://localhost:4200`, and confirm:
- Visiting `/` while logged out redirects to `/login`.
- Signup a new user → lands on home showing the name; `localStorage` has `hk.auth.creds`.
- Duplicate signup → inline "account already exists" (409).
- Signup with a blank field / bad email → inline field errors (client, and 400 mapping).
- Logout → back to `/login`, `hk.auth.creds` gone.
- Login with good creds → home; bad creds → inline "invalid credentials" and **no** native browser popup.
- Refresh (F5) while logged in → still on home (guard passes from persisted creds).
- Toggle EN⇄UR → whole page mirrors to RTL, Urdu renders in Nastaliq, layout holds; `<html dir>`/`lang` update.

- [ ] **Step 5: Commit**

```bash
cd /home/muhammad_ahmad/hisaabkitaab
git add src/frontend/src/app/features/auth/signup
git commit -m "adding bilingual signup screen with client + server validation"
```

---

## Self-Review Notes

- **Spec coverage:** scope/shell/guard (T8), localStorage creds (T5), bilingual+RTL i18n (T4), signal-based engine (T4), Nastaliq (T4), CORS+entry point (T1), FE apiUrl env (T3), Signal Forms (T9/T10), 409 handler (T2), passwordHash already safe (no task needed), manual verification (T10). Tests intentionally omitted per decision.
- **Type consistency:** `setSession(credentials, user)`, `credentials`/`currentUser`/`isAuthenticated`, `clear()`, `t(key, params?)`, `dir`, `apiUrl`, `authInterceptor`, `authGuard`/`publicOnlyGuard`, `ApiError.fieldErrors` are used identically across tasks.
- **Execution ordering caveat:** frontend modules T3–T8 only compile once T9–T10 exist (routes/interceptor forward-reference them); the first full frontend build is deliberately at T10 Step 3.
