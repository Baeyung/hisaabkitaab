# migrations

Flyway owns the Postgres schema. `spring.jpa.hibernate.ddl-auto` is `validate`, so Hibernate
never changes the database — it only refuses to start when the entities and the schema disagree.

## Adding a change

1. New file here: `V<next>__short_description.sql` (`V2__add_store_currency.sql`). Numbers must
   be unique and increasing; never edit or renumber a file that has already run anywhere.
2. Write the DDL by hand, then make the entity match.
3. Boot the app. Flyway applies it and Hibernate validates the result.

Applied versions are recorded in the `flyway_schema_history` table. A failed migration leaves
the version unrecorded, so fix the script and boot again.

## Things that used to be automatic

- **Adding an `@Enumerated(STRING)` value** now needs a migration — the CHECK constraint is not
  self-healing any more (`EnumCheckConstraintSync` is gone):

  ```sql
  alter table transactions drop constraint transactions_event_check,
      add constraint transactions_event_check check (event::text = any (array['SALE', ...]));
  ```

- **New columns/tables** no longer appear on their own from `ddl-auto: update`.

## Tests

Tests run on H2 and build their schema from the entities, with `spring.flyway.enabled: false` —
these scripts are Postgres DDL and are not exercised there.
