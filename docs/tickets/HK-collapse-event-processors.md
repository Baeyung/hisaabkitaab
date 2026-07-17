# HK-EVENT-01 — Collapse the event-processor hierarchy into `TransactionEvent`

**Status:** Open · **Priority:** Medium · **Area:** Backend / Domain · **Size:** ~150 lines → ~20

## Context

`processors/transactionevent/` is six files — an `EventProcessor` interface and five
`@Component` implementations (`Sale`, `Purchase`, `Receipt`, `Payment`, `Expense`). Each
one is a Spring bean with no state, no injected collaborators, and no logic. They exist to
return two constants:

```java
@Component
public class SaleEventProcessor implements EventProcessor
{
    @Override
    public Map<TargetKind, InOut> getTargetKinds()
    {
        return Map.of(
                TargetKind.CASH, InOut.IN,
                TargetKind.PARTY, InOut.UNKNOWN,
                TargetKind.STOCK, InOut.OUT
        );
    }

    @Override
    public TransactionEvent getTransactionEvent() { return TransactionEvent.SALE; }
}
```

This is a lookup table — `TransactionEvent → Map<TargetKind, InOut>` — spread across six
files and reassembled at startup. `EventService` spends ~25 lines of stream/collector code
folding the injected `List<EventProcessor>` back into the map the table already was,
complete with a duplicate-key guard against a collision that only component scanning makes
possible in the first place.

Note this is **not** the same shape as `KindProcessor` (`processors/targetkind/`), which
genuinely earns its polymorphism: those implementations inject services, branch, and write
`TransactionLine` rows. Leave that hierarchy alone.

## Target design

Move the table onto the `TransactionEvent` enum, which is already the thing being keyed on:

```java
public enum TransactionEvent
{
    SALE(Map.of(TargetKind.CASH, InOut.IN,
                TargetKind.PARTY, InOut.UNKNOWN,   // direction derived: received − bill
                TargetKind.STOCK, InOut.OUT)),
    PURCHASE(Map.of(TargetKind.CASH, InOut.OUT,
                    TargetKind.PARTY, InOut.UNKNOWN, // direction derived: bill − cash
                    TargetKind.STOCK, InOut.IN)),
    RECEIPT(Map.of(TargetKind.CASH, InOut.IN,
                   TargetKind.PARTY, InOut.OUT)),
    PAYMENT(Map.of(TargetKind.CASH, InOut.OUT,
                   TargetKind.PARTY, InOut.IN)),
    EXPENSE(Map.of(TargetKind.CASH, InOut.OUT));

    private final Map<TargetKind, InOut> targetKinds;

    TransactionEvent(Map<TargetKind, InOut> targetKinds) { this.targetKinds = targetKinds; }

    public Map<TargetKind, InOut> getTargetKinds() { return targetKinds; }
}
```

Carry the `InOut.UNKNOWN` comments across verbatim — they explain that `PartyProcessor`
derives the party direction from the cash/bill delta, which is the least obvious thing in
the table.

### To do
1. Add the `targetKinds` field to `TransactionEvent` (see also HK-DEAD-01 re: `ADJUSTMENT`).
2. Delete `processors/transactionevent/` entirely (interface + 5 implementations).
3. In `EventService`: drop the `List<EventProcessor>` constructor param, the
   `eventProcessorMap` field, and its collector block. `publishEvent` reads
   `eventRequest.getTransactionEvent().getTargetKinds()` directly.
4. Keep the `kindProcessorMap` construction as-is.

## Watch out for

`EventService.publishEvent` currently does `if (processor != null)` and **silently
no-ops** when no processor is registered for an event. With the table on the enum that
branch is unreachable by construction (`ADJUSTMENT` is the only member with no entry —
give it an empty map or handle it explicitly). Don't preserve the silent-success path:
an unhandled event should throw, the way an unknown `TargetKind` already does.

## Done when

- `processors/transactionevent/` no longer exists.
- `EventService` takes 4 constructor params instead of 5 and holds one map, not two.
- Posting each of SALE / PURCHASE / RECEIPT / PAYMENT / EXPENSE writes the same
  `TRANSACTION_LINE` rows as before.
