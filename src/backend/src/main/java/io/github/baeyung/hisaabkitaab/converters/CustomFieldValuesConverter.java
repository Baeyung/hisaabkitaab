package io.github.baeyung.hisaabkitaab.converters;

import java.math.BigDecimal;
import java.util.Map;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * {@code transaction_lines.custom_fields} ⇄ the shop's own entry boxes for one line.
 *
 * <p>Same two-sided bargain as {@link StoreSettingsConverter}: a write that cannot be
 * serialised fails loudly, a row that cannot be read comes back null. Losing what a
 * shopkeeper typed on the way *in* is silent data loss on a ledger, so it throws; refusing
 * to read one line's extra columns on the way *out* would make a whole bill unopenable over
 * numbers the line already carries in {@code quantity} and {@code item_sold_at}, which is
 * exactly what a null falls back to on the client.
 *
 * <p>The keys are the client's field ids and mean nothing here — see
 * V14__transaction_line_custom_fields.sql. The only thing this side has an opinion about is
 * how long one may be, because it is the trust boundary: the map's <em>size</em> is capped by
 * bean validation on the request, but a key's length is not reachable from there.
 */
@Converter
public class CustomFieldValuesConverter implements AttributeConverter<Map<String, BigDecimal>, String>
{
    private static final Logger log = LoggerFactory.getLogger(CustomFieldValuesConverter.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final TypeReference<Map<String, BigDecimal>> TYPE = new TypeReference<>() {};

    /** Matches {@code CustomField.id}'s cap in {@link io.github.baeyung.hisaabkitaab.models.CustomField}. */
    private static final int MAX_KEY_LENGTH = 64;

    @Override
    public String convertToDatabaseColumn(Map<String, BigDecimal> attribute)
    {
        try
        {
            if (attribute == null || attribute.isEmpty())
            {
                return null;
            }

            attribute.keySet().forEach(CustomFieldValuesConverter::checkKey);

            return MAPPER.writeValueAsString(attribute);
        }
        catch (Exception e)
        {
            throw new IllegalStateException("Failed to serialise custom field values: " + attribute, e);
        }
    }

    @Override
    public Map<String, BigDecimal> convertToEntityAttribute(String dbData)
    {
        try
        {
            if (dbData == null)
            {
                return null;
            }

            return MAPPER.readValue(dbData, TYPE);
        }
        catch (Exception e)
        {
            // The line still reads: the client falls back to quantity and rate, which are
            // the two columns every line has carried since the beginning.
            log.error("Failed to deserialise custom field values from: {}", dbData, e);
            return null;
        }
    }

    private static void checkKey(String key)
    {
        if (key == null || key.isBlank() || key.length() > MAX_KEY_LENGTH)
        {
            throw new IllegalArgumentException("Custom field id must be 1–" + MAX_KEY_LENGTH + " characters: " + key);
        }
    }
}
