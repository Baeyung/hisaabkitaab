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
 * Moves expense categories from the old {@code expense_category} enum column onto the
 * new per-store {@code expense_categories} table + {@code expense_category_id} FK. Runs
 * once per boot after Hibernate's schema export; both steps are idempotent, so it
 * no-ops on every boot after the first.
 *
 * <p>Step 1 seeds each store's default heads (skips stores that already have some) —
 * runs on every database. Step 2 points each old expense line at its store's matching
 * category row (matching the old token, or UNCATEGORIZED when it was null); Postgres
 * only, since fresh H2 test databases carry no legacy rows to migrate.
 *
 * ponytail: one-time data migration; delete once every environment has run it. The old
 * nullable {@code expense_category} column is left behind (ddl-auto=update never drops).
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
        storeRepository.findAll().forEach(expenseCategoryService::seedDefaults);

        if (!isPostgres() || !hasLegacyColumn())
        {
            return; // Nothing to migrate: legacy string column only exists on upgraded Postgres DBs.
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
    }

    /** True once the legacy enum column has already been dropped (or never existed), so step 2 is skippable. */
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
