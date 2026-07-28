# Expense Screen — Design

**Date:** 2026-07-17
**Status:** Approved for planning
**Scope:** Frontend only. No backend or schema changes.

## 1. Problem

`New Entry → Expense` is the last unbuilt event on the entry menu. Today
`features/new-entry/expense.ts` renders `<app-placeholder titleKey="nav.expense" />`.
The route (`new-entry/expense`) and the whole backend path already exist.

A shopkeeper needs to record cash that leaves the drawer for something that is
*not* a party settlement — bijli, chai, rent, mazdoori, transport. Without it,
the nightly galla reconciliation (APPLICATION_DOMAIN §3.3) cannot balance: cash
is gone from the drawer with no entry to explain it.

## 2. What already exists

- **`ExpenseEventProcessor`** maps `EXPENSE` to exactly one line: `CASH → OUT`.
  No party line, no stock line.
- **`EventService.resolveParty`** returns `null` when `party` is absent, so a
  party-less event posts cleanly.
- **`CashProcessor`** reads `payload.getCashAmount()` and posts the single line.
- **Route** `new-entry/expense` → `Expense` (lazy-loaded), already registered.
- **Translation keys** `nav.expense` (خرچ), `error.generic`, `sale.billDate`
  exist in both `en.ts` and `ur.ts`.

**Conclusion: no Java changes.** The screen is a frontend-only build.

## 3. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Details field | **Free-text note only**, no category taxonomy | Maps to the existing `TRANSACTION.description`. Zero schema change. Categories would need a new column to be worth anything; faking them inside `description` creates structure that fights real reporting later. Revisit when expense analytics is actually specced. |
| Party | **None at all** | `EXPENSE` posts no PARTY line, so naming a party would not move their baqaya — an Effect panel showing a party with no effect is a trust bug. Paying down what you owe a party is already `PAYMENT`. |
| Details required? | **Required to save** | Expense has no party name or item list to identify it, so the note *is* the record. An undescribed `Rs 500` row is exactly what breaks the galla story. Diverges from Payment/Receipt, where the party name already explains the row. |
| Code sharing | **Extract shared logic; keep components separate** | See §5. |

## 4. The screen

A separate `Expense` component under `features/new-entry/`, following the
existing entry-screen layout (form on the left, effect rail on the right) and
reusing `sale.css` via `styleUrl`, as `goods-entry` and `party-cash-entry`
already do.

```
New entry
Expense                                    [ 2026-07-17 ]

Amount                  [        4500 ]
Details                 [ bijli bill        ]
Reference no. (opt.)    [                   ]

           [ Clear ]        [ Save + Next ↵ ]

┌── Effect ──────────────────────┐
│  ▼  Drawer (cash)     Rs 4,500 │
│     bijli bill                 │
└────────────────────────────────┘
```

**Fields:** date (defaults today, backdatable per §7 of the domain doc), amount,
details (required), reference no. (optional).

Details carries a persistent `fld__hint` below it (`expense.details.hint`),
mirroring how Payment/Receipt hint their party field. The requirement is
communicated up front by the hint and enforced by the disabled Save button —
there is no separate error string, because the button never lets an
empty-details save be attempted.

**Effect panel:** a single `▼ Drawer (cash)` row — honest, because an expense
really does only move cash. The details text renders as an `fx__sub` subtitle
under the row so mid-entry the user sees *what* the money went to, keeping the
live-consequence feedback the domain doc asks for. Empty state before an amount
is entered, matching the other screens.

**Just entered rail:** same in-session rail as the other entry screens, capped
at 6.

**Save:** `canSave = amount > 0 && details.trim() !== '' && !saving`.

Request posted to `POST /api/event`:

```ts
{
  transactionEvent: 'EXPENSE',
  cashAmount: amount,
  billAmount: null,
  billNumber: billNumber.trim() || null,
  billDate: billDate || null,
  description: details.trim(),
  party: null,
  items: [],
}
```

`party` is `EventParty | null` on `EventRequest` — a required property, so it
must be passed explicitly as `null`, not omitted. `'EXPENSE'` is already in the
`transactionEvent` union.

On success: push to the recent rail, reset amount/details/reference, keep the
date (batch-entry rhythm). On failure: `error.generic` toast, nothing cleared.

## 5. Shared-logic extraction

`money()` is currently copy-pasted three times and `easternDigits` is declared
four times. Expense must not add a fourth/fifth copy, so extract **first**, then
build Expense on the result.

Extraction targets *logic only*, not markup. The entry screens already share
`sale.css` via `styleUrl`, so `.recent` / `.toast` / `.panel` styling is shared
today. Promoting the rail or toast into child components would break that:
Angular's emulated view encapsulation would stop `sale.css` from styling their
DOM, forcing `.panel` to be duplicated into each child's stylesheet or promoted
to a global-primitives layer this codebase has not established (`styles.css` is
53 lines: tokens plus `.num`). The markup is ~8 lines and already style-shared;
the logic is what actually drifts.

| # | Extract | Replaces | Consumers after |
| --- | --- | --- | --- |
| 1 | `LocaleService.money(n)` | 3 copies of `money()`, 3 stray `easternDigits` consts | goods-entry, party-cash-entry, items, expense |
| 2 | `shared/date.util.ts` → `todayIso()` | 2 copies | goods-entry, party-cash-entry, expense |
| 3 | `shared/recent-log.ts` → `RecentEntry` + `RecentLog` | 2 verbatim `RecentEntry` interfaces, duplicated keySeq/push/cap logic | goods-entry, party-cash-entry, expense |
| 4 | `shared/toast-state.ts` → `ToastState` | 1 copy (`toast` signal + `showToast` + timer) | party-cash-entry, expense |

**#1 — `LocaleService.money(n)`.** The service already owns the locale signal and
an `easternDigits` table; the three local copies exist only because
`formatNumber` lacks thousands grouping. Add `money()` beside it; delete the
stray consts. `formatNumber` stays as-is — `items.ts` uses it for percents.

**#3 — `RecentLog`.** Owns `keySeq`, `push(summary, sub)`, cap-at-6, and exposes
an `entries` signal. Templates keep their own 8-line `@for` block.

**#4 — `ToastState`.** `message` signal, `show(msg)` (replaces any current
message, auto-clears after 4s), and `dispose()` to clear the pending timer.
Consumers wire `dispose()` to `DestroyRef.onDestroy`, fixing a latent leak: the
current implementation never clears its timer on destroy.

**Explicitly out of scope:** converting `goods-entry`'s inline
`errorKey`/`.alert` error display to `ToastState`. The two screens report errors
inconsistently, but that is a behavior change to a working screen that Expense
does not need. Separate ticket.

**Not doing:** renaming `sale.css` → `entry.css`. It is a real naming smell (one
file serving Sale, Purchase, Receipt, Payment and now Expense) but it is
cosmetic and touches working screens for no functional gain. Separate ticket.

## 6. Translation keys

New keys, added to **both** `en.ts` and `ur.ts` (`TranslationKey` is a union of
`en`'s literal keys, so a missing `ur` entry is a compile error):

| Key | English |
| --- | --- |
| `expense.newEntry` | New entry |
| `expense.amount` | Amount |
| `expense.details` | Details |
| `expense.details.ph` | What was it for? e.g. bijli bill |
| `expense.details.hint` | Every expense needs details — this is what you'll read in the cashbook later. |
| `expense.billNumber` | Reference no. |
| `expense.billNumber.ph` | Optional |
| `expense.clear` | Clear |
| `expense.saveNext` | Save + Next |
| `expense.effect` | Effect |
| `expense.effect.drawer` | Drawer (cash) |
| `expense.effect.empty` | Enter an amount and the effect shows here. |
| `expense.recent` | Just entered |
| `expense.recent.label` | Expense |

Reused: `nav.expense`, `error.generic`, `sale.billDate`.

Urdu strings use the domain vocabulary (خرچ for expense) and must be authored,
not machine-guessed, at implementation time.

## 7. Risks

- **Extractions #1–#3 touch working screens** (`goods-entry`, `items`,
  `party-cash-entry`). All are like-for-like swaps and the compiler checks every
  call site, but these screens must be re-verified after the swap.
- **`money()` output must not change.** The extracted version has to produce
  byte-identical output to the three copies (`en-US` grouping,
  `maximumFractionDigits: 2`, `'Rs '` prefix, eastern digits under `ur`).

## 8. Verification

- Build passes; no `any` introduced; strict mode clean.
- Expense: amount + details saves, posts one CASH/OUT line, appears in the
  cashbook and lands in the recent rail.
- Save blocked with an empty/whitespace-only details field, and with amount ≤ 0.
- Backdated expense records `event_date` as chosen and `entry_date` as today.
- Effect panel reads `▼ Drawer (cash)` with the details subtitle.
- Urdu/RTL: layout mirrors, digits render eastern, no English leaks.
- Regression: Receipt, Payment, Sale, Purchase and Settings→Items still format
  money identically to before.
