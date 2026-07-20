package io.github.baeyung.hisaabkitaab.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

/**
 * Stamps UNCATEGORIZED onto expense cash lines that predate the expense_category
 * column, so no expense line is ever null and the khata's by-category totals
 * reconcile with the cashbook. Runs once per boot after Hibernate's schema export;
 * idempotent (only touches null rows), so it no-ops on every boot after the first.
 *
 * ponytail: one-time data migration; delete once every environment has run it.
 */
@Component
@RequiredArgsConstructor
public class ExpenseCategoryBackfill
{
    private static final Logger log = LoggerFactory.getLogger(ExpenseCategoryBackfill.class);

    private final JdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void backfill()
    {
        int updated = jdbc.update("""
                update transaction_lines
                set expense_category = 'UNCATEGORIZED'
                where expense_category is null
                  and target_kind = 'CASH'
                  and transaction_id in (select id from transactions where event = 'EXPENSE')
                """);
        if (updated > 0)
        {
            log.info("Backfilled {} expense line(s) to UNCATEGORIZED", updated);
        }
    }
}
