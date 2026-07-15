# Login / Signup Screens + Backend Integration — Design

**Date:** 2026-07-15
**Status:** Approved for planning
**Feature slice:** Frontend auth screens (login, signup), auth wiring, minimal shell, and the
matching backend integration changes.

---

## 1. Goal

Deliver the first vertical slice of the HisaabKitaab frontend: a shopkeeper can **sign up**,
**log in**, and land on a guarded home page — with credentials attached to every API call — talking
to the existing Spring Boot backend over HTTP Basic auth. Screens are fully bilingual (English +
Urdu) with RTL support from day one.

This slice proves the whole auth loop end-to-end without building real app screens.

## 2. Locked decisions

| Area | Choice |
|---|---|
| Scope | Auth screens + minimal shell + route guard + placeholder home page |
| Credential storage | Persistent `localStorage` (base64 `id:pw`), cleared on 401 / logout |
| Localization | Full bilingual EN/UR + RTL now, via a lightweight signal-based i18n service |
| i18n engine | Home-grown signal-based `LocaleService` (no new dependency) |
| Urdu typeface | **Noto Nastaliq Urdu** (traditional, ledger tone) — with explicit line-height / small-size care |
| BE connectivity | Backend CORS (allow `:4200`) + custom `AuthenticationEntryPoint`; FE calls `http://localhost:8080/api` directly via an environment file |
| Forms | Signal Forms (`@angular/forms/signals`) per project CLAUDE.md |
| Duplicate signup | Backend returns **409** (new handler); FE shows "account already exists" |
| Tests | **Deferred** — added once there is an MVP to test against |

## 3. Backend facts this design relies on (verified)

- `POST /api/auth/signup` — public, body `{ name, contactNumber, email, password }`, returns the
  `User` (`{ id, contactNumber, name, email }`).
- `GET /api/auth/me` — authenticated, returns the same `User` shape.
- `User.passwordHash` is `@JsonIgnore`d → never serialized. Confirmed safe.
- Validation `400` returns a typed `ApiError`:
  ```json
  { "status": 400, "error": "Bad Request", "message": "Validation failed",
    "path": "/api/auth/signup",
    "fieldErrors": { "email": "must be a well-formed email address" } }
  ```
- `SignupRequest` constraints: `name` `@NotBlank`, `contactNumber` `@NotBlank`, `email` `@Email`,
  `password` `@NotBlank`.
- Security is stateless HTTP Basic, CSRF disabled, only signup is public.
- **Known gap being fixed here:** `contactNumber` is `unique`; a duplicate currently throws
  `DataIntegrityViolationException` → generic handler → **500**. This slice adds a **409** handler.

---

## 4. Frontend architecture

```
src/environments/
  environment.ts                 apiUrl (prod placeholder value)
  environment.development.ts     apiUrl = 'http://localhost:8080/api'
src/app/
  core/
    auth/
      auth.models.ts             User, SignupRequest, Credentials, ApiError types
      auth.store.ts              signals: credentials, currentUser, isAuthenticated;
                                 localStorage hydrate / persist / clear
      auth.service.ts            signup(), login() (verify via /me), logout()
      auth.interceptor.ts        attach Basic header (skip signup); on 401 clear + redirect
      auth.guard.ts              authGuard (protect /), publicOnlyGuard (bounce authed users)
    i18n/
      locale.service.ts          locale signal, dir computed, t(key, params), formatNumber
      translations/en.ts
      translations/ur.ts
  features/
    auth/login/login.ts          inline template
    auth/signup/signup.ts        inline template
    home/home.ts                 placeholder "Welcome, {name}" + logout
  shared/
    language-toggle/language-toggle.ts   EN <-> UR toggle button
```

**Routes** (`app.routes.ts`):

| Path | Guard | Component |
|---|---|---|
| `/login` | publicOnly | Login |
| `/signup` | publicOnly | Signup |
| `/` | authGuard | Home (placeholder) |
| `**` | — | redirect to `/` |

Auth feature routes are lazy-loaded (`loadComponent`) per project conventions.

**`app.config.ts`** gains `provideHttpClient(withInterceptors([authInterceptor]))`.

### 4.1 Auth store (`auth.store.ts`)

A `providedIn: 'root'` service holding session state as signals:

- `credentials = signal<string | null>(...)` — base64 `id:pw`, hydrated from `localStorage` on init.
- `currentUser = signal<User | null>(null)`.
- `isAuthenticated = computed(() => credentials() !== null)`.
- `setSession(creds: string, user: User)` — sets both signals and writes creds to `localStorage`.
- `clear()` — nulls both signals and removes creds from `localStorage`.

`localStorage` key holds only the base64 credential string. `currentUser` lives in memory and is
re-fetched via `/me` when needed (e.g. on a hard refresh, an optional bootstrap call can rehydrate
`currentUser` from stored creds).

### 4.2 Auth service (`auth.service.ts`)

- `signup(req: SignupRequest)` → `POST {apiUrl}/auth/signup` (no auth header). On `200`, build
  `Credentials` from the entered email/contact + password, call `store.setSession`, return the user.
- `login(identifier, password)` → build Basic header, `GET {apiUrl}/auth/me`. On `200`, store
  session + return user. `401` rejects (nothing stored).
- `logout()` → `store.clear()` (no server call — Basic auth is stateless).

### 4.3 Interceptor (`auth.interceptor.ts`)

Functional `HttpInterceptorFn`:

- If the request URL targets `apiUrl` **and** is **not** `POST …/auth/signup`, attach
  `Authorization: Basic <credentials()>` when present.
- On response `401`: `store.clear()` + `router.navigate(['/login'])`, then rethrow.

### 4.4 Guards (`auth.guard.ts`)

- `authGuard` — `CanActivateFn`: `isAuthenticated()` ? true : redirect `/login`.
- `publicOnlyGuard` — `CanActivateFn`: `isAuthenticated()` ? redirect `/` : true. Keeps logged-in
  users off the login/signup screens.

---

## 5. Auth flows

### Signup
1. User fills name, contactNumber, email, password.
2. `POST /api/auth/signup` (public).
3. `200` → construct credentials from entered email/contact + password → `setSession` → navigate `/`.
4. `400` → map `ApiError.fieldErrors` onto the corresponding Signal Form fields.
5. `409` → inline form error: "account already exists" (bilingual).
6. Network / `500` → generic error message.

### Login
1. User enters identifier (contact number **or** email) + password.
2. Build `Authorization: Basic base64(identifier:password)`.
3. `GET /api/auth/me` with that header.
4. `200` → `setSession` → navigate `/`.
5. `401` → inline "invalid credentials"; nothing stored.

### Logout
- Clear store (and thus `localStorage`); route to `/login`.

---

## 6. Internationalization & RTL

`LocaleService` (`providedIn: 'root'`):

- `locale = signal<'en' | 'ur'>(...)` — hydrated from `localStorage`, default `en`.
- `dir = computed(() => locale() === 'ur' ? 'rtl' : 'ltr')`.
- An `effect` stamps `document.documentElement.dir` and `.lang` whenever `locale` changes.
- `t(key: string, params?: Record<string, string>)` — looks up `en.ts` / `ur.ts` and does
  `{{param}}` interpolation.
- `formatNumber(n)` — renders Eastern-Arabic digits when `locale() === 'ur'`, Western otherwise.

**Translations** — typed string maps in `en.ts` / `ur.ts`; the same key set in both, enforced by a
shared `TranslationKey` type so a missing translation is a compile error.

**RTL mechanics** — layout uses CSS **logical properties** (`margin-inline`, `padding-inline`,
`inset-inline`, `text-align: start`) so one stylesheet serves both directions; `dir` on `<html>`
drives mirroring. PrimeNG components respect `dir`.

**Urdu typeface** — **Noto Nastaliq Urdu**, loaded in `styles.css`. Because Nastaliq has tall,
calligraphic glyphs: apply a generous `line-height` on Urdu text, avoid tight fixed-height inputs
(let fields grow to fit), and verify labels/buttons at real Urdu string lengths (Urdu runs longer
than English). A Latin numeral-strong fallback is set ahead of it for digits.

**Language toggle** — a shared `LanguageToggle` component (EN ⇄ UR), placed in the auth screens'
header, calling `LocaleService`.

---

## 7. Screens & states

All screens: large tap/click targets, ≥16px base text, WCAG AA contrast, keyboard-operable,
AXE-clean (per project CLAUDE.md). Built with Signal Forms.

- **Login** — identifier field, password field, submit button, "create account" link, language
  toggle. States: idle / submitting / 401 error.
- **Signup** — name, contactNumber, email, password, submit, "have an account?" link, language
  toggle. Client validation mirrors server (`NotBlank` ×3, `@Email`). States: idle / submitting /
  field errors (from `fieldErrors`) / 409 duplicate.
- **Home (placeholder)** — greeting "Welcome, {name}" + logout button. Deliberately bare; the real
  dashboard is a later slice.

---

## 8. Backend changes

1. **CORS** — a `CorsConfigurationSource` bean: allowed origin `http://localhost:4200`, methods
   `GET, POST, OPTIONS`, headers `Authorization, Content-Type`, `allowCredentials(true)`; wired into
   the filter chain with `.cors(withDefaults())`.
2. **`RestAuthenticationEntryPoint`** — a custom `AuthenticationEntryPoint` whose `commence()`
   returns `401` with a JSON `ApiError` body and **no `WWW-Authenticate` header**, so the browser
   never shows its native Basic-auth popup on a failed programmatic login. Wired via
   `httpBasic(h -> h.authenticationEntryPoint(entryPoint))`.
3. **Duplicate-signup handler** — in `GlobalExceptionHandler`, an
   `@ExceptionHandler(DataIntegrityViolationException)` returning **409** with an `ApiError`
   (message: "Account already exists"), so a repeated contactNumber/email is a clean, mappable error
   instead of a 500.

---

## 9. Out of scope (this slice)

- Automated tests (FE and BE) — deferred until MVP.
- Real dashboard / any post-login app screens beyond the placeholder home.
- Password reset, OTP-to-phone login, "remember me" UI (persistence is on by default).
- Store setup / opening-balance onboarding.
- Production CORS origins / deployment config (dev-only origin for now).

---

## 10. Verification (manual, this slice)

Since automated tests are deferred, the slice is verified by driving the real app:
- Signup a new user → lands on home, creds in `localStorage`, subsequent `/me` succeeds.
- Duplicate signup → 409 → inline "account already exists".
- Login with good creds → home; bad creds → inline error, **no** native browser popup.
- Refresh (F5) → still logged in. Logout → back to `/login`, `localStorage` cleared.
- Toggle EN ⇄ UR → full RTL mirror, Urdu strings render in Nastaliq, layout holds at Urdu lengths.
