# HK — Sale: kaat (discount) on the bill

## Context
The SALE entry screen (`features/new-entry/sale`) currently computes
`billAmount = sum(qty × rate)` with no discount. The design mockup
(`docs/mockup/Transaction Entry.dc.html`) includes a **kaat** field — a
discount subtracted from the line total before the party is charged.

Deferred from the initial SALE build to keep scope tight.

## What to add
- A `kaat` input on the totals block (currency, default 0).
- `billAmount = sum(qty × rate) − kaat`; the Effect panel's baqaya recomputes
  off the discounted total. `cashAmount` (received) is unchanged.
- Decide the contract: either extend `EventRequest` with a `kaat` field, or keep
  sending the already-discounted `billAmount` (frontend-only). Backend
  (`EventRequest`, `SaleEventProcessor`) has no kaat concept today.
- i18n keys exist in the mockup: `kaat` → EN "Kaat" / UR "کاٹ".

## Out of scope
Per-line discounts (kaat is bill-level only).
