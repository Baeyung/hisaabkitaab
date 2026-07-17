# HK-DEPS-01 — Drop unused frontend dependencies (PrimeNG, Tailwind)

**Status:** Open · **Priority:** High · **Area:** Frontend / Build · **Risk:** Low (PrimeNG) / Medium (Tailwind preflight)

## Context

An over-engineering audit of the tree found two UI toolchains installed and paid for on
every build, neither of which the app actually renders through. Every screen
(`new-entry/*`, `settings/*`, `auth/*`, `layout/shell`) is hand-rolled HTML against the
`--kg-*` design tokens in `src/styles.css`.

## PrimeNG + @primeuix/themes — zero usage

- No component imports anywhere: `grep -rn "primeng\|@primeuix" --include=*.ts src/` returns
  only `app.config.ts`.
- No `<p-*>` tags in any template.
- No PrimeNG CSS imported in `angular.json` (`styles` is just `styles.css` + `styles/auth.css`)
  or via `@import` in any stylesheet.

The entire footprint is the provider block in `app.config.ts`:

```ts
providePrimeNG({
  theme: { preset: Aura },
  license: '',
})
```

Worth noting: `shared/toast-state.ts` documents *why* the toast is hand-rolled — PrimeNG's
Toast is license-gated and silently drops messages without a valid PrimeUI license. That
decision already stands; this ticket just removes the unused dependency that decision
routed around.

### To do
1. Remove `primeng` and `@primeuix/themes` from `package.json`.
2. Delete the `providePrimeNG` call and the `primeng/config` + `@primeuix/themes/aura`
   imports from `app.config.ts`.

## Tailwind + @tailwindcss/postcss + postcss — zero utility classes

`src/styles.css:2` does `@import 'tailwindcss'`, but the tree uses no utility classes. The
sole `class="grid"` hit (`new-entry/goods-entry.html:39`) is a hand-written rule in
`sale.css`, not Tailwind's `display:grid` utility. No `@apply`, no `theme()`, no
`@tailwind` directives anywhere.

### To do
1. Remove `tailwindcss`, `@tailwindcss/postcss`, and `postcss` from `devDependencies`.
2. Delete `.postcssrc.json`.
3. Remove the `@import 'tailwindcss'` line from `src/styles.css`.

### ⚠️ Caveat — Preflight

`@import 'tailwindcss'` also pulls in **Preflight**, Tailwind's CSS reset (margin zeroing,
`box-sizing: border-box`, unstyled headings/lists, etc.). The hand-written CSS may be
leaning on it without saying so. Removing the import removes the reset.

Do this step behind a visual check of the entry screens, shell, and auth pages. If
anything shifts, add a small explicit reset to `styles.css` (`box-sizing`, margin zeroing)
rather than keeping the whole framework for it — that is a handful of lines against three
dependencies and a PostCSS pass.

Recommend shipping the PrimeNG removal and the Tailwind removal as **separate commits** so
a layout regression bisects cleanly to the Preflight change.

## Done when

- `package.json` no longer lists `primeng`, `@primeuix/themes`, `tailwindcss`,
  `@tailwindcss/postcss`, `postcss`.
- `.postcssrc.json` is gone.
- `ng build` succeeds; bundle size drops.
- Entry screens, shell, and auth pages render unchanged (screenshot compare before/after
  the Preflight removal specifically).
