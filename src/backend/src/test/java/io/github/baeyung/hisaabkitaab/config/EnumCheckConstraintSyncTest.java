package io.github.baeyung.hisaabkitaab.config;

import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The drift check hinges on parsing the enum values back out of a Postgres
 * constraint definition, then set-comparing them to the Java enum.
 */
class EnumCheckConstraintSyncTest
{
    @Test
    void parsesEnumValuesFromConstraintDef()
    {
        String def = "CHECK (((event)::text = ANY (ARRAY['SALE'::text, 'PURCHASE'::text, 'OPENING_CASH'::text])))";

        assertEquals(Set.of("SALE", "PURCHASE", "OPENING_CASH"),
                EnumCheckConstraintSync.parseAllowedValues(def));
    }

    @Test
    void treatsMissingConstraintAsEmpty()
    {
        assertTrue(EnumCheckConstraintSync.parseAllowedValues(null).isEmpty());
    }

    @Test
    void detectsDriftWhenEnumGainsAValue()
    {
        // A stale DB missing the newest value must not equal the current enum set.
        Set<String> have = EnumCheckConstraintSync.parseAllowedValues(
                "CHECK (((event)::text = ANY (ARRAY['SALE'::text, 'PURCHASE'::text])))");
        Set<String> want = Set.of("SALE", "PURCHASE", "OPENING_CASH");

        assertTrue(!want.equals(have), "should detect the DB is behind the enum");
    }
}
