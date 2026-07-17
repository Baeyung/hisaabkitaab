# HK-LAYERS-01 — Drop the single-implementation service interfaces

**Status:** Open · **Priority:** Medium · **Area:** Backend / Structure · **Size:** ~101 lines

## Context

`service/` holds six interfaces, each implemented exactly once in `service/impl/`:

| Interface | Implementation | Interface LOC |
|---|---|---|
| `UserService` | `UserServiceImpl` | 9 |
| `TransactionService` | `TransactionServiceImpl` | 8 |
| `TransactionLineService` | `TransactionLineServiceImpl` | 12 |
| `PartyService` | `PartyServiceImpl` | 23 |
| `StoreService` | `StoreServiceImpl` | 25 |
| `StoreItemService` | `StoreItemServiceImpl` | 24 |

No second implementation exists or is planned, nothing mocks against the interface (there
are no backend tests), and every injection site takes the interface purely because that is
what was published. Several are pure one-liner pass-throughs to a repository:

```java
public interface TransactionService
{
    Transaction create(Transaction transaction);
}
```

Spring autowires concrete classes without ceremony, and `@Transactional` works on them
directly (CGLIB proxying, already in play for the `Impl` classes). The interface buys
nothing here except a second file to open and an `Impl` suffix that admits the layer is
vestigial. `EventService` already skips the pattern — it is a plain `@Service` in
`service/impl/` with no interface — and reads no worse for it.

## Target design

For each pair: delete the interface, move the implementation up to `service/`, and rename
`FooServiceImpl` → `FooService`.

**Move the javadoc.** The interfaces are where the useful contract notes live — the
404-on-wrong-owner semantics on `findByIdForOwner`, the cascade-delete warnings on
`delete`, "the owner's primary store" on `findByOwner`. These are the most valuable lines
in the files being deleted. Every one of them must land on the corresponding method of the
concrete class; losing them is a worse outcome than keeping the interfaces.

### To do
1. Per service: move `service/impl/FooServiceImpl.java` → `service/FooService.java`,
   rename the class, delete `implements FooService`, drop the now-redundant `@Override`s.
2. Port every javadoc comment from the interface onto the concrete method.
3. Delete `service/impl/` once empty (`EventService` moves up to `service/` too — it is
   already interface-free and only lives under `impl/` by accident of convention).
4. Fix imports at injection sites (controllers, processors, other services).

## Reconsider if

A second implementation genuinely appears (e.g. a caching or remote-backed `StoreService`),
or backend tests arrive that want to mock these rather than use `@MockBean`/Mockito against
the class. Neither is true today. Extracting an interface later, when there is a real
second implementation to shape it, is a mechanical refactor the IDE does — and it will be a
*better* interface for having a second caller to design against.

## Related

- HK-DEAD-01 covers the redundant methods *within* these services
  (`findFirstByOwnerIdentifier` vs `getPrimaryStoreForOwner`, the `StoreItemService.create`
  overload). Land that first — it means less javadoc to port here.

## Done when

- `service/impl/` is gone; `service/` holds six concrete `@Service` classes and `EventService`.
- No `*Impl` remains in the backend.
- Every contract note that lived on an interface method now lives on the concrete method.
- App boots; all endpoints behave unchanged.
