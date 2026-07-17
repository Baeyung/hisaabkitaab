# HK-I18N-01 — The entry-screen label configs are mostly mechanical

**Status:** Open · **Priority:** Low · **Area:** Frontend / i18n · **Size:** ~160 lines
**Confidence:** Low — this may well be worth leaving alone. Read the counter-argument first.

## Context

`sale.ts`, `purchase.ts`, `payment.ts`, `receipt.ts` are each a thin `@Component` whose
whole body is a config object handed to a shared entry component. `sale.ts` and
`purchase.ts` declare ~40 label keys apiece, the majority of which are a mechanical
`key → "${prefix}.${key}"`:

```ts
labels: {
  newEntry: 'sale.newEntry',
  party: 'sale.party',
  lines: 'sale.lines',
  total: 'sale.total',
  // …~35 more
}
```

Four files, ~160 lines, restating a naming convention the dictionary already follows.

## The counter-argument (why this might stay)

`goods-entry.ts` documents the choice explicitly, and the reasoning is sound:

> Keys are passed in as literals rather than built from a prefix because `TranslationKey`
> is a union of the dictionary's literal keys — concatenation would need a cast and lose
> the missing-key check.

That check is real and worth money: `LocaleService.t()` indexes
`Record<TranslationKey, string>`, so a typo'd or missing key is a **compile error today**,
in both `en.ts` and `ur.ts`. Any change here that trades that away for shorter files is a
bad trade — Urdu is a first-class locale in this app, not an afterthought, and a silently
missing `ur` key ships a half-English screen to the shopkeeper.

## If it's worth doing

TypeScript can derive the keys *and* keep the check, via a template-literal type:

```ts
type Prefixed<P extends string, K extends string> = `${P}.${K}` & TranslationKey;
```

A key that doesn't exist in the dictionary resolves to `never` and still fails the build —
no cast needed. The config then declares only the genuine exceptions, which is the useful
signal currently buried in 40 lines of boilerplate:

- `title` → `nav.sale` (not `sale.title`)
- `cash` → `sale.received` / `purchase.paid`
- `effectOutstanding` → `sale.effect.theyOwe` / `purchase.effect.youOwe`
- `partyPh` → `sale.party.ph`, and the other `.ph` / dotted-suffix keys

## Honest assessment

This trades ~160 lines of dumb, greppable, obviously-correct boilerplate for one clever
type. Boilerplate that a newcomer reads without effort has real value, and
`grep -rn "sale.effect.theyOwe"` currently finds its use site instantly — after the change
it won't, because the string won't exist in the source.

Do this only if the label configs start being edited often enough to feel like a tax, or if
a fifth and sixth entry screen make the pattern worse. Otherwise close it as **won't fix**
— the current form is defensible, and the audit that raised it said so.

## Done when

Either the configs declare only their exceptions with the missing-key check intact and both
locales still compile — or this ticket is closed as won't-fix with the reasoning recorded.
