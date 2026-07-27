# TICKET: Split apex domain (marketing) vs subdomain (app) routing

**Context:** Single Angular SPA, single build, single Docker container/origin. Two public hostnames point at the same origin via Cloudflare Tunnel. Routing behavior must differ based on which hostname loaded the app.

**Desired behavior:**
- `hisaabkitaab.shop` (apex) + `www.hisaabkitaab.shop` → always shows `/info` (public marketing/landing page)
- `aapka.hisaabkitaab.shop` → normal app behavior: existing `authGuard` logic (redirect to `/login` if signed out, or into the app shell if signed in)

**Non-goals:** No separate build, no separate container, no SSR. Same bundle serves both hostnames.

---

## TASK 2: Frontend — hostname-aware guard

**File:** `src/app/core/auth/apex-redirect.guard.ts` (new file)

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

const APEX_HOSTS = ['hisaabkitaab.shop', 'www.hisaabkitaab.shop'];

export const apexRedirectGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (APEX_HOSTS.includes(window.location.hostname)) {
    router.navigate(['/info']);
    return false;
  }
  return true;
};
```

**File:** `src/app/app.routes.ts` (edit)

- [ ] Import `apexRedirectGuard`
- [ ] Add it to the root route's `canActivate`, **before** `authGuard**:

```typescript
{
  path: '',
  canActivate: [apexRedirectGuard, authGuard],
  loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
  children: [...]  // unchanged
}
```

> Guards run in array order; if `apexRedirectGuard` returns `false`, `authGuard` never executes. On `aapka.hisaabkitaab.shop` the hostname check fails to match, guard returns `true`, existing `authGuard` behavior is unchanged.

**Acceptance criteria:**
- Visiting `hisaabkitaab.shop` or `www.hisaabkitaab.shop` (signed in or out) always lands on `/info`.
- Visiting `aapka.hisaabkitaab.shop` signed out → redirects to `/login` (unchanged existing behavior).
- Visiting `aapka.hisaabkitaab.shop` signed in → loads dashboard (unchanged existing behavior).
- Deep links (e.g. `aapka.hisaabkitaab.shop/inventory`) still resolve correctly — only the **root path** behavior changes.

---

## TASK 3: Verify SPA fallback in Nginx (don't skip)

Since this is one build serving multiple hostnames/paths client-side, confirm the frontend's Nginx config has a catch-all fallback, or deep links + hard refreshes will 404:

**File:** frontend Nginx config (e.g. `src/frontend/nginx.conf` or wherever the container config lives)

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

- [ ] Confirm this block exists
- [ ] Test: hard-refresh on `aapka.hisaabkitaab.shop/dashboard` directly (not via in-app navigation) — should load correctly, not 404

---

## Known limitation (acceptable, no action needed)

`window.location.hostname` check runs client-side after the JS bundle loads, so apex visitors see a brief blank/loading flash before the `/info` redirect fires. Acceptable for a marketing page; not in scope to eliminate (would require separate builds per hostname).

---

## Definition of Done
- [ ] All three hostnames route through Cloudflare to the origin
- [ ] Apex + www always show `/info`, regardless of auth state
- [ ] `aapka` subdomain preserves all existing auth/app behavior unchanged
- [ ] Deep links and hard refreshes work on both hostnames