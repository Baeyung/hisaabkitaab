# HK-DATE-01 — One `toIso`, not three

**Status:** Open · **Priority:** Low · **Area:** Frontend / Shared · **Size:** ~10 lines · **Risk:** Low

## Context

The same local-calendar-day ISO expression is written out three times:

```ts
`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
```

- `shared/date.util.ts:11` — inside `todayIso()`
- `shared/date.util.ts:19` — inside `daysAgoIso()`
- `shared/date-field/date-field.ts:26` — as a private `toIso(d: Date)`

`date-field.ts` already has the function the other two want; it just isn't shared.

## Why it matters more than 10 lines suggests

The comment in `date.util.ts` explains the one thing this expression exists to get right:

```ts
// Local calendar day, NOT UTC — toISOString() would roll to yesterday for
// the early-morning hours east of UTC (e.g. 04:06 in Pakistan = 23:06 UTC).
```

That reasoning lives on one of the three copies. The other two are correct by coincidence
of having been copy-pasted. Three copies of a date rule is three chances for the next
edit to reintroduce `toISOString()` in the copy that has no comment on it — and the bug it
causes (an entry landing on yesterday's date, for a Pakistani shopkeeper working early) is
exactly the kind that gets noticed in the cashbook a week later.

## To do

1. Export `toIso(d: Date): string` from `shared/date.util.ts`, carrying the local-vs-UTC
   comment.
2. `todayIso()` → `toIso(new Date())`. `daysAgoIso(n)` keeps its `setDate` and calls `toIso`.
3. `date-field.ts` imports `toIso` and deletes its private copy.

Note: `date-field.ts` also has `parseIso` and `isoToTyped` as private helpers. `parseIso` is
the natural companion to `toIso` — move it too if a second caller ever appears, but don't
move it speculatively. One function, one move.

## Not in scope

`new Date().toLocaleDateString('en-CA')` also yields `yyyy-mm-dd` in local time and would
make this a one-liner. It is rejected deliberately: it works by way of a locale's
formatting convention rather than by saying what it means, and the next reader has to know
that Canadian English happens to format dates ISO-style. The explicit version is longer and
obvious; keep it.

## Done when

- `grep -rn "padStart(2, '0')" src/frontend/src` returns one hit.
- Date fields and entry-screen defaults still show today's local date (check after 00:00 and
  before 05:00 PKT if you can, that being the window the comment is about).
