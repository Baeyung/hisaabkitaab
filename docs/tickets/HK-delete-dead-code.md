# HK-DEAD-01 — Delete dead code

**Status:** Open · **Priority:** Medium · **Area:** Backend + Frontend · **Size:** ~150 lines · **Risk:** Low

## Context

Audit sweep for code with no readers. Each item below was confirmed unreferenced by grep
over the whole tree (excluding `.claude/worktrees/`). These are independent — land them in
one commit or several, whatever bisects best.

## Backend

### `ValueMetaData` + `ValueMetaDataConverter` (63 lines)
The only reference in the tree is **commented out**, at `entity/TransactionLine.java:57`:

```java
//    @Convert(converter = ValueMetaDataConverter.class)
```

A JPA `AttributeConverter` that no attribute converts, JSON-round-tripping a model
(`cashValue` / `bankValue` / `billValue`) nothing reads. Delete
`models/ValueMetaData.java`, `converters/ValueMetaDataConverter.java`, and the commented
line. If the multi-value line ever lands, it lands with the schema it needs then.

### Empty controllers (25 lines)
`controller/UserController.java` and `controller/TransactionController.java` are
`@RestController @RequestMapping(...)` with **empty bodies** — no endpoints. They reserve
`/api/users` and `/api/transactions` against nothing. Delete both; re-add when there is a
handler to put in them.

### Unused enum constants
- `TransactionEvent.ADJUSTMENT` — no reader. (Coordinate with HK-EVENT-01, which puts a
  `targetKinds` map on every member; `ADJUSTMENT` would need an empty one. Deleting it is
  cleaner than inventing a table for an event nobody posts.)
- `TargetKind.BANK` — no reader; comment already says `// not supported in this release`.
- `InOut.NONE` — no reader (`IN`, `OUT`, `UNKNOWN` are all used).
- `ValueMetaData.bankValue` — dies with the class above.

⚠️ **Check the DB first.** These are persisted via `@Enumerated`. Confirm no rows carry
`ADJUSTMENT` / `BANK` / `NONE` before deleting the constants, or reads will blow up on
existing data. `docker/postgres/init/01-init.sql` and the dummy-data scripts are the places
to look.

### Redundant service methods
- **`StoreService.findFirstByOwnerIdentifier` vs `getPrimaryStoreForOwner`** — both mean
  "the primary store for this owner". `getPrimaryStoreForOwner` throws 404 itself;
  `findFirstByOwnerIdentifier` returns null and makes its one caller
  (`EventService.publishEvent:86`) hand-throw the same 404. Keep the throwing one, delete
  the other, drop the null check at the call site.
- **`StoreItemService.create` has two overloads** — the 1-arg form has exactly one caller
  (`StockProcessor:72`), the 2-arg form one (`StoreItemController:50`). Fold into a single
  signature.

## Frontend

### `Home` component (33 lines)
`features/home/home.ts` is unrouted and unimported. `app.routes.ts` has no `home` path and
`''` redirects to `dashboard`. It renders a welcome + logout that the shell already owns.
Delete the directory.

### `app.spec.ts` (23 lines) — **currently failing**
Stale Angular CLI scaffolding. It asserts:

```ts
expect(compiled.querySelector('h1')?.textContent).toContain('Hello, hisaabkitaab');
```

against an `app.html` that is now just `<router-outlet />`. There is no `h1`. This is the
only spec in the repo, so the failure has been invisible — `npm test` has presumably not
been part of anyone's loop.

Delete it. **But note what it implies:** the frontend has zero test coverage, and this
ticket removes the last file that made it look otherwise. That is a truthful state to be
in, not a regression — but it deserves its own conversation rather than being silently
absorbed here.

### `app.css` (0 bytes)
Empty file, still wired via `styleUrl: './app.css'` in `app.ts`. Delete the file and the
`styleUrl` line.

## Done when

- All listed files are gone; `ng build` and `mvn package` both succeed.
- No enum constant is deleted without confirming the DB holds no such value.
- `grep -rn "ValueMetaData\|UserController\|TransactionController\|features/home" src/`
  returns nothing.
