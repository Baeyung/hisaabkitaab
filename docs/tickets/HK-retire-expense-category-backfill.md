# HK-MIGRATION-01 — Retire `ExpenseCategoryBackfill`

**Status:** Open · **Priority:** Low · **Area:** Backend / Boot · **Size:** ~166 lines · **Risk:** Low, *once the precondition holds*

## Context

`config/ExpenseCategoryBackfill.java` is a one-time migration from the old
`transaction_lines.expense_category` enum column to the per-store `expense_categories`
table + `expense_category_id` FK. It runs on `ApplicationReadyEvent`, on **every** boot,
forever.

It says so itself, at the bottom of its own class javadoc:

```java
 * ponytail: one-time migration; once every environment has booted this once, the legacy column
 * is gone and this class is a pure no-op — delete it. Tracked as debt, not left to rot.
```

This ticket is that debt being collected. Nothing here is a new discovery — it is the
class's own instruction, filed so it doesn't rot.

## Why it is (probably) already a no-op

The class has three steps, and each one gates itself off after it has run:

| Step | Guard | State after it has run |
|---|---|---|
| 1. Seed default heads per store | `seedDefaultsById` skips stores that already have categories | Every existing store has categories → loop does nothing but N queries |
| 2. Backfill the FK | `isPostgres() && hasLegacyColumn()` | Column dropped by step 3 → returns immediately |
| 3. Drop the legacy column | `drop column if exists`, gated on zero un-backfilled rows | Column gone → `hasLegacyColumn()` false → step 2 never reaches it again |

So on a database that has booted this once, the whole thing costs one `information_schema`
query plus a `findAll()` over stores per boot, and changes nothing.

Step 1 is the one to think about: it is *not* purely legacy. It seeds default expense heads
for stores that have none. New stores must keep getting their defaults — check where
`seedDefaultsById` is called from on the store-creation path (`StoreServiceImpl.create` /
`ExpenseCategoryService`) before assuming this class is the only thing doing it. **If store
creation does not seed defaults on its own, fix that first, in the create path where it
belongs — then delete this class.** Do not delete step 1's behaviour along with the file.

## ⚠️ Precondition — verify before deleting

The class is only safe to remove once **every** environment that holds real data has booted
it at least once. Concretely, on each such database:

```sql
-- must return 0 rows: the legacy column is gone
select 1 from information_schema.columns
where table_name = 'transaction_lines' and column_name = 'expense_category';

-- must return 0: no expense line is missing its FK
select count(*) from transaction_lines tl
join transactions t on tl.transaction_id = t.id
where t.event = 'EXPENSE' and tl.target_kind = 'CASH' and tl.expense_category_id is null;

-- must return 0: no store is left without expense heads
select count(*) from stores s
where not exists (select 1 from expense_categories ec where ec.store_id = s.id);
```

Environments to check: the home-server deployment (`docs/homeserver/home-server.md`) and
any developer Postgres volume (`postgres-data-hk`) that predates the `aa9465e adding
dynamic categories` commit. Fresh H2 test databases carry no legacy rows and are not a
concern.

Also check the boot logs for `Dropped legacy expense_category column — migration complete`.
If a database still logs `Keeping legacy expense_category column: N expense line(s) not yet
backfilled`, this ticket is **blocked** — that database still needs the class.

## To do

1. Run the three queries above against every live database. All zeros.
2. Confirm new-store creation seeds default expense categories **without** this class. If it
   doesn't, move that seeding into the store-creation path first.
3. Delete `config/ExpenseCategoryBackfill.java`.
4. Drop the now-unused `seedDefaultsById` from `ExpenseCategoryService` **only if** nothing
   else calls it after step 2.

## Done when

- `ExpenseCategoryBackfill.java` is gone and `mvn package` succeeds.
- Creating a brand-new store still gets default expense heads (verify in the app, not just
  in tests).
- The queries in the precondition section return zeros on every environment that matters.
