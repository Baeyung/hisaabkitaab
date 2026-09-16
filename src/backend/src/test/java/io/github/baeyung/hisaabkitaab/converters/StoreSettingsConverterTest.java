package io.github.baeyung.hisaabkitaab.converters;

import io.github.baeyung.hisaabkitaab.enums.ChromeItem;
import io.github.baeyung.hisaabkitaab.models.StoreSettings;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StoreSettingsConverterTest
{
    private final StoreSettingsConverter converter = new StoreSettingsConverter();

    /**
     * The document every shop had before {@code purchaseUpdatesSalePrice} existed, verbatim
     * from production. A primitive added to the record must read as its zero value here, not
     * throw and take the whole arrangement — menu, easy mode, report schedule — down with it.
     */
    @Test
    void aDocumentSavedBeforeAPrimitiveWasAddedStillLoads()
    {
        String saved = "{\"menu\":[],\"hideChrome\":[\"PLAN\"],\"easyMode\":true,"
                + "\"reports\":{\"dailyEnabled\":false,\"dailyTime\":\"20:00\","
                + "\"reminderEnabled\":false,\"reminderDay\":31,\"reminderTime\":\"10:00\","
                + "\"reminderMinAmount\":0.0,\"reminderMinDaysStale\":30}}";

        StoreSettings settings = converter.convertToEntityAttribute(saved);

        assertNotNull(settings, "an old document must not be dropped as unreadable");
        assertTrue(settings.easyMode());
        assertEquals(java.util.Set.of(ChromeItem.PLAN), settings.hideChrome());
        assertFalse(settings.purchaseUpdatesSalePrice());
    }

    @Test
    void roundTripsWhatItWrote()
    {
        StoreSettings written = new StoreSettings(null, null, null, true, null, true, null);

        StoreSettings read = converter.convertToEntityAttribute(converter.convertToDatabaseColumn(written));

        assertEquals(written, read);
    }
}
