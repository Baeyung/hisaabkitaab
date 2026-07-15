# Progress — feat/auth-login-signup

Plan: docs/superpowers/plans/2026-07-15-auth-login-signup.md
Started: 2026-07-15

Task 1: complete (commits ae036b4..7ae9fbe, review clean — Approved)
  Minor (defer to final review): entry-point Content-Type lacks charset=UTF-8; error body hand-rolled JSON (no 'path' field, differs from ApiError shape); SecurityConfig manual ctor vs @RequiredArgsConstructor. All inherited from plan snippets.
Task 2: complete (commits 7ae9fbe..8434de1, review clean — Approved, no issues)
Task 3: complete (commits 8434de1..ca14823, review clean — Approved, no issues)
Task 4: complete (commits ca14823..6cc4e47, review clean — Approved; includes controller CSS @import-order fix 6cc4e47)
  Minor (defer to final/Task 10): ur.ts uses value import for TranslationKey type -> switch to 'import type' if Task 10 build errors under verbatimModuleSyntax; t() replaces only first {{param}} occurrence (fine for current keys); locale signal reads localStorage with no SSR guard (browser-only app, fine).
Task 5: complete (commits 6cc4e47..2513397, review clean — Approved, no issues)
Task 6: complete (commits 2513397..2efbc89, review clean — Approved, no issues)
Task 7: complete (commits 2efbc89..f7245fd, review clean — Approved, no issues)
Task 8: complete (commits f7245fd..4077543, review clean — Approved, no issues)
Task 9: complete (commits 4077543..8b04890, review clean — Approved, no issues)
Task 10: complete (commits 8b04890..fde997a, review clean — Approved). First GREEN npm run build. Signal Forms reconciled: Control/[control] -> FormField/[formField] across BOTH login+signup (installed Angular 22.0.6 API); verified against node_modules .d.ts.
  Minor (final review): per-field signup server errors render canned client string not backend body.fieldErrors[field] text; login/signup share verbatim submit scaffolding (fine for 2 screens).
  ENV NOTE: Angular 22 CLI needs Node >= v26 (nvm use v26.5.0); default node v18 fails. Recommend .nvmrc / package.json engines. Out of this slice's scope.
ALL 10 TASKS COMPLETE.

FINAL WHOLE-BRANCH REVIEW (opus): Ready to merge = YES. No Critical.
  Important #1 (fast-follow): no /me bootstrap on app init -> after hard refresh currentUser=null (Home shows 'Welcome, ' empty) AND stale/expired creds never trigger a 401. AuthStore.setUser() exists but unused. Spec marked this bootstrap OPTIONAL. Fix: app initializer calling GET /auth/me when creds present.
  Minors: entry-point body != ApiError shape / no charset; ur.ts value-import of type (non-issue, no verbatimModuleSyntax); t() first-occurrence replace; signup canned per-field msgs (arguably correct); no Node pin (.nvmrc) though Angular22 needs Node>=26; login/signup verbatim scaffolding (don't abstract yet); btoa throws on non-Latin1 password; handleDuplicate maps any DataIntegrityViolation.
DESIGN REVAMP: commit df69dbc — login/signup restyled to the Kapra Ghar ledger system (AuthShell two-pane + khata hero, tokens in styles.css + styles/auth.css, IBM Plex Sans, i18n hero/tagline keys). npm run build GREEN. Preview artifact published.
