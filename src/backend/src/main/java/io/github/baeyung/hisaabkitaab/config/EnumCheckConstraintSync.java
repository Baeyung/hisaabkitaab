package io.github.baeyung.hisaabkitaab.config;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import io.github.baeyung.hisaabkitaab.enums.ExpenseCategory;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import lombok.RequiredArgsConstructor;

/**
 * Keeps each {@code @Enumerated(STRING)} column's Postgres CHECK constraint in
 * sync with its Java enum. Hibernate generates these checks only when it first
 * creates a column, and {@code ddl-auto=update} never evolves them — so adding an
 * enum value (e.g. {@code OPENING_CASH}) leaves existing databases rejecting the
 * new value at insert, and columns added later carry no check at all.
 *
 * <p>This runs once per boot, after Hibernate's schema export: for each registered
 * column it rebuilds the constraint from the current enum, but only when the two
 * have actually drifted. It is idempotent and self-healing — new enum values need
 * no migration, and existing customer databases repair themselves on next deploy.
 * Register a row in {@link #COLUMNS} for every new {@code @Enumerated(STRING)} column.
 */
@Component
@RequiredArgsConstructor
public class EnumCheckConstraintSync
{
    private static final Logger log = LoggerFactory.getLogger(EnumCheckConstraintSync.class);

    /** Every table/column/constraint name is interpolated into DDL, so it must be a plain identifier. */
    private static final Pattern IDENTIFIER = Pattern.compile("[a-z_][a-z0-9_]*");
    private static final Pattern QUOTED_VALUE = Pattern.compile("'([^']*)'");

    /** The {@code @Enumerated(STRING)} columns whose DB check must track the Java enum. */
    private static final List<EnumColumn> COLUMNS = List.of(
            new EnumColumn("transactions", "event", TransactionEvent.class),
            new EnumColumn("transaction_lines", "target_kind", TargetKind.class),
            new EnumColumn("transaction_lines", "in_out", InOut.class),
            new EnumColumn("transaction_lines", "expense_category", ExpenseCategory.class));

    private final JdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void sync()
    {
        if (!isPostgres())
        {
            return; // The pg_constraint catalog queries below are Postgres-only.
        }
        COLUMNS.forEach(this::syncColumn);
    }

    private void syncColumn(EnumColumn col)
    {
        String constraint = col.table() + "_" + col.column() + "_check";
        if (!isIdentifier(col.table()) || !isIdentifier(col.column()) || !isIdentifier(constraint))
        {
            log.warn("Skipping enum sync for {}.{}: unsafe identifier", col.table(), col.column());
            return;
        }

        Set<String> want = Arrays.stream(col.enumType().getEnumConstants())
                .map(Enum::name)
                .collect(Collectors.toCollection(TreeSet::new));
        Set<String> have = parseAllowedValues(currentConstraintDef(constraint));

        if (want.equals(have))
        {
            return; // Already in sync — nothing to do.
        }

        String values = want.stream().map(v -> "'" + v + "'").collect(Collectors.joining(", "));
        jdbc.execute("alter table " + col.table()
                + " drop constraint if exists " + constraint
                + ", add constraint " + constraint
                + " check (" + col.column() + "::text = any (array[" + values + "]))");
        log.info("Synced check constraint {} to enum {} ({} values)", constraint, col.enumType().getSimpleName(), want.size());
    }

    private String currentConstraintDef(String constraint)
    {
        return jdbc.query(
                "select pg_get_constraintdef(oid) from pg_constraint where conname = ?",
                rs -> rs.next() ? rs.getString(1) : null,
                constraint);
    }

    /** The values a check constraint currently allows, parsed from its definition; empty when it has none. */
    static Set<String> parseAllowedValues(String constraintDef)
    {
        Set<String> values = new TreeSet<>();
        if (constraintDef != null)
        {
            Matcher m = QUOTED_VALUE.matcher(constraintDef);
            while (m.find())
            {
                values.add(m.group(1));
            }
        }
        return values;
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
            log.warn("Could not determine database product; skipping enum constraint sync", e);
            return false;
        }
    }

    private static boolean isIdentifier(String s)
    {
        return IDENTIFIER.matcher(s).matches();
    }

    private record EnumColumn(String table, String column, Class<? extends Enum<?>> enumType) {}
}
