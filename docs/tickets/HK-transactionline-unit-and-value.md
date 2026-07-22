# HK-BUG-01 — `TransactionLine.unit` and stock-line `value` look wrong

**Status:** Open · **Priority:** Needs triage · **Area:** Backend / Domain
**Not an over-engineering item** — surfaced incidentally during the audit sweep and filed
so it isn't lost. Both need verification against intent before anyone "fixes" them.

## 1. `unit` is hardcoded, in two different spellings

`KindProcessor.getTransactionLine` (the shared default method) stamps every line:

```java
.unit("gaz")
```

while `StockProcessor.resolveItem`, creating a `StoreItem` for an unknown name, uses:

```java
.unit("gz")
```

So: `"gaz"` on `TRANSACTION_LINE`, `"gz"` on `STORE_ITEM`, for the same physical unit. And
neither reads the item's actual `unit` — `StoreItem.unit` is a real, user-editable column
(`settings/items` lets the shopkeeper set it, and `StoreItemServiceImpl` persists it), but a
`TransactionLine` for an item measured in meters still records `"gaz"`.

The frontend already treats unit as per-item: `goods-entry.ts` has `lineUnit(design)`
reading `matchItem(design)?.unit`, and the Effect panel renders `"100 Meter"` off it. The
line rows don't agree with the screen that wrote them.

**Questions before fixing:**
- Should `TransactionLine.unit` snapshot `item.getUnit()` at write time (denormalised for
  history, so later renaming the item's unit doesn't rewrite past rows)? That's the usual
  ledger answer and I'd guess the intent.
- Or should the column go away and reads join to `StoreItem`?
- Either way `"gz"` vs `"gaz"` should settle on one spelling, and new-item creation should
  probably not be guessing a unit at all — see `HK-sale-kaat-discount.md` for precedent on
  the backend tolerating unknown items.

## 2. Every stock line records `cashAmount` as its `value`

`StockProcessor.process` maps over N request items, and for each one:

```java
TransactionLine transactionLine = getTransactionLine(
        transaction,
        payload.getCashAmount(),   // ← same cash total, on every line
        inOut
);
transactionLine.setItem(item);
transactionLine.setQuantity(requestItem.getQuantity());
transactionLine.setItemSoldAt(requestItem.getItemSoldAt());
```

A three-line sale writes three STOCK rows each carrying the full `cashAmount` in `value`,
alongside the correct per-item `quantity` and `itemSoldAt`. Summing `value` over stock
lines would triple-count the cash.

`quantity` and `itemSoldAt` are set per-line and look right, so possibly `value` is simply
unused for STOCK rows and this is harmless-but-misleading rather than broken. **Verify
what reads `TransactionLine.value` for `targetKind = STOCK`** before changing anything —
nothing in the tree does today (there are no report/ledger reads yet), which is exactly why
it hasn't bitten.

If `value` is meant to be the line's money, it should be `quantity × itemSoldAt`. If it's
meant to be null for stock, it should be null.

## Also here

`getTransactionLine` sets `.party(transaction.getParty())` on **every** line regardless of
`targetKind` — CASH and STOCK rows carry the party too. May be intentional (denormalised
for querying), may be copy-paste. Worth a sentence of comment either way.

## 3. A negative cash amount is dropped to stdout and swallowed

Added by a later audit sweep — same "filed so it isn't lost" spirit as the rest of this
ticket.

`CashProcessor.process` opens with:

```java
if (payload.getCashAmount().compareTo(0.0d) < 0)
{
    System.out.println("Cash amount must be greater or equal to zero");
    return;
}
```

Two problems on four lines:

- **The `return` is silent.** The transaction has *already been created* by
  `EventService.publishEvent` before any `KindProcessor` runs. So a negative cash amount
  leaves a saved `TRANSACTION` with no CASH line against it — a half-posted entry, and the
  API still answers 200. The shopkeeper sees the entry save and the drawer not move.
  Rejecting the request at the boundary (`@PositiveOrZero` on `EventRequest.cashAmount`,
  which `GlobalExceptionHandler` already turns into a 400 with field errors) is both
  smaller and correct.
- **`System.out.println` for an error condition**, when slf4j is already a dependency and
  used elsewhere in the tree (`ExpenseCategoryBackfill`). On the home-server deployment
  this goes to the container's stdout unstructured and unleveled, so it is invisible to
  any log filter. Two more copies sit in `converters/ValueMetaDataConverter.java:24,44` —
  those die with HK-DEAD-01, leaving this one.

Also note `getCashAmount()` is a `Double` and is dereferenced without a null check, so an
event posted without `cashAmount` NPEs into the generic 500 handler rather than a 400.
Bean validation on the DTO fixes that on the same line as the negative case.

**Question before fixing:** is there an event type that legitimately posts no cash and
relies on this early return? `ExpenseEventProcessor` maps only `CASH`, so an expense with
no amount would currently save an empty transaction. Confirm the intended contract for
"cash amount omitted" before choosing between `@NotNull @PositiveOrZero` and defaulting to
zero.

## Done when

- One spelling of the unit, sourced from `StoreItem.unit` rather than hardcoded.
- A negative or missing `cashAmount` is rejected with a 400 before any transaction row is
  written, and no `System.out.println` remains in `processors/`.
- Stock lines' `value` either holds the per-line amount or is explicitly null, with the
  reason written down.
- The `party`-on-every-line decision is documented on `KindProcessor.getTransactionLine`.
