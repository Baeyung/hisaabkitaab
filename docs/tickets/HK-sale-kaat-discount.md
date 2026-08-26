# HK — Sale/purchase: kaat (discount) on the bill

## Status: done

An explicit `discount` input now sits on both the SALE and PURCHASE entry screens
(`features/new-entry/goods-entry`), for any party — walk-in, khata, or a bit of both.

- `EventRequest.discountAmount` carries it to the backend; `Transaction.discount`
  persists it (migration `V12__transaction_discount.sql`).
- `PartyProcessor` folds it into the due amount (`bill − discount`) before weighing
  cash against it, so a khata party's baqaya and a walk-in's settlement both come out
  right from the same arithmetic — no more inferring a discount from an unbalanced,
  party-less document.
- Read back everywhere a document's totals show: `BillSummaryResponse`,
  `BillDetailResponse`, `CashbookRowResponse`, and the entry screen's own Effect panel
  and print preview.

Per-line discounts are still out of scope — this is bill-level only, as originally
proposed.
