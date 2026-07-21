package io.github.baeyung.hisaabkitaab.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import io.github.baeyung.hisaabkitaab.repository.StoreRepository;
import io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService;
import lombok.RequiredArgsConstructor;

/**
 * One-time migration from the old {@code expense_category} enum column to the per-store
 * {@code expense_categories} table + {@code expense_category_id} FK. Runs after the app is
 * ready, on every boot, and is safe to run any number of times on any number of instances:
 *
 * <ul>
 *   <li><b>Step 1 — seed defaults</b> for each store that has none. Runs on every database.
 *       Each store is seeded in its own transaction and guarded independently, so a failure
 *       on one store (or a concurrent instance winning the race — the unique {@code (store_id,
 *       name)} constraint makes the loser a no-op) never aborts the rest.</li>
 *   <li><b>Step 2 — backfill the FK</b> from the legacy column, matching the old token (or
 *       UNCATEGORIZED when it was null). Idempotent (only touches null FKs) and Postgres-only,
 *       since fresh H2 test databases carry no legacy rows.</li>
 * </ul>
 *
 * <p>The whole thing is wrapped so any error is logged and swallowed — a migration hiccup must
 * never take down an already-serving instance.
 *
 * <p><b>Step 3 — drop the legacy column</b> once, but only after step 2 has left nothing behind
 * (zero expense lines with a legacy value but no FK). That gate is what makes the drop safe: we
 * never discard a value we haven't already copied onto the FK. Guarded by {@code drop column if
 * exists} + {@link #hasLegacyColumn()}, so it happens exactly once and no-ops forever after.
 *
 * <p>Caveat for rolling deployments: the drop assumes no previous-version instance is still
 * writing the old column. On a single upgrade (or once all instances are on this version) that
 * holds; if you run a true zero-downtime rollout, pause this class until the old instances are
 * gone.
 *
 * ponytail: one-time migration; once every environment has booted this once, the legacy column
 * is gone and this class is a pure no-op — delete it. Tracked as debt, not left to rot.
 */
@Component
@RequiredArgsConstructor
public class ExpenseCategoryBackfill
{
    private static final Logger log = LoggerFactory.getLogger(ExpenseCategoryBackfill.class);

    private final JdbcTemplate jdbc;
    private final StoreRepository storeRepository;
    private final ExpenseCategoryService expenseCategoryService;

    @EventListener(ApplicationReadyEvent.class)
    public void backfill()
    {
        try
        {
            seedExistingStores();
            backfillForeignKeys();
        }
        catch (Exception e)
        {
            log.warn("Expense category migration did not complete; will retry on next boot", e);
        }
    }

    /** Give every pre-existing store its default heads. Per-store isolation so one bad store can't stop the rest. */
    private void seedExistingStores()
    {
        int seeded = 0;
        for (String storeId : storeRepository.findAll().stream().map(s -> s.getId()).toList())
        {
            try
            {
                // Re-fetch inside seedDefaults' own transaction; skips stores that already have categories.
                expenseCategoryService.seedDefaultsById(storeId);
                seeded++;
            }
            catch (Exception e)
            {
                // A concurrent instance seeding the same store trips the unique constraint — harmless.
                log.debug("Skipped seeding categories for store {}: {}", storeId, e.getMessage());
            }
        }
        if (seeded > 0)
        {
            log.info("Ensured default expense categories for {} store(s)", seeded);
        }
    }

    private void backfillForeignKeys()
    {
        if (!isPostgres() || !hasLegacyColumn())
        {
            return; // Nothing to migrate: legacy column only exists on upgraded Postgres databases.
        }

        int updated = jdbc.update("""
                update transaction_lines tl
                set expense_category_id = ec.id
                from transactions t, expense_categories ec
                where tl.transaction_id = t.id
                  and t.event = 'EXPENSE'
                  and tl.target_kind = 'CASH'
                  and tl.expense_category_id is null
                  and ec.store_id = t.store_id
                  and ec.name = coalesce(tl.expense_category, 'UNCATEGORIZED')
                """);
        if (updated > 0)
        {
            log.info("Backfilled {} expense line(s) onto the expense_categories table", updated);
        }

        dropLegacyColumnIfMigrated();
    }

    /** Retires the legacy column, but only once no expense line still needs its value copied across. */
    private void dropLegacyColumnIfMigrated()
    {
        Integer pending = jdbc.queryForObject("""
                select count(*) from transaction_lines tl
                join transactions t on tl.transaction_id = t.id
                where t.event = 'EXPENSE'
                  and tl.target_kind = 'CASH'
                  and tl.expense_category is not null
                  and tl.expense_category_id is null
                """, Integer.class);

        if (pending != null && pending > 0)
        {
            log.warn("Keeping legacy expense_category column: {} expense line(s) not yet backfilled", pending);
            return;
        }

        jdbc.execute("alter table transaction_lines drop column if exists expense_category");
        log.info("Dropped legacy expense_category column — migration complete");
    }

    /** True while the legacy enum column is still present (so step 2 has something to read). */
    private boolean hasLegacyColumn()
    {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                where table_name = 'transaction_lines' and column_name = 'expense_category'
                """, Integer.class);
        return count != null && count > 0;
    }

    private boolean isPostgres()
    {
        try
        {
            String product = jdbc.execute((ConnectionCallback<String>)
                    con -> con.getMetaData().getDatabaseProductName());
            return product != null && product.toLowerCase().contains("postgresql");
        }
        catch (Exception e)
        {
            log.warn("Could not determine database product; skipping expense category backfill", e);
            return false;
        }
    }
}
