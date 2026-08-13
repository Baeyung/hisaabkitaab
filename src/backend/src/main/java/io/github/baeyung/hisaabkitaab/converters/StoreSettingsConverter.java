package io.github.baeyung.hisaabkitaab.converters;

import io.github.baeyung.hisaabkitaab.models.StoreSettings;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code stores.settings} ⇄ {@link StoreSettings}. Same two-sided bargain as
 * {@link ValueMetaDataConverter}: a write that cannot be serialised fails loudly, a row that
 * cannot be read comes back null.
 *
 * <p>They are not symmetrical on purpose. Losing a shop's arrangement on the way *in* would
 * be silent data loss, so it throws. Refusing to read one on the way *out* would make the
 * whole store unloadable — and with it every screen in the shop — over a menu that a null
 * simply resets to the built-in one.
 */
@Converter
public class StoreSettingsConverter implements AttributeConverter<StoreSettings, String>
{
    private static final Logger log = LoggerFactory.getLogger(StoreSettingsConverter.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(StoreSettings attribute)
    {
        try
        {
            if (attribute == null)
            {
                return null;
            }

            return MAPPER.writeValueAsString(attribute);
        }
        catch (Exception e)
        {
            throw new IllegalStateException("Failed to serialise StoreSettings: " + attribute, e);
        }
    }

    @Override
    public StoreSettings convertToEntityAttribute(String dbData)
    {
        try
        {
            if (dbData == null)
            {
                return null;
            }

            return MAPPER.readValue(dbData, StoreSettings.class);
        }
        catch (Exception e)
        {
            // The shop keeps working with the built-in menu; the owner can arrange it again.
            log.error("Failed to deserialise StoreSettings from: {}", dbData, e);
            return null;
        }
    }
}
