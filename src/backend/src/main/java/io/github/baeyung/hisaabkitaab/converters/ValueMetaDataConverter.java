package io.github.baeyung.hisaabkitaab.converters;

import io.github.baeyung.hisaabkitaab.models.ValueMetaData;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.ObjectMapper;

@Converter
public class ValueMetaDataConverter implements AttributeConverter<ValueMetaData, String>
{
    private static final Logger log = LoggerFactory.getLogger(ValueMetaDataConverter.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(ValueMetaData attribute)
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
            // Was swallowed to null, which silently wrote away the metadata. Fail the
            // write instead: a lost column is worse than a 500 someone can act on.
            throw new IllegalStateException("Failed to serialise ValueMetaData: " + attribute, e);
        }
    }

    @Override
    public ValueMetaData convertToEntityAttribute(String dbData)
    {
        try
        {
            if (dbData == null)
            {
                return null;
            }

            return MAPPER.readValue(dbData, ValueMetaData.class);
        }
        catch (Exception e)
        {
            // The row is already bad; throwing here would make the whole entity unloadable.
            log.error("Failed to deserialise ValueMetaData from: {}", dbData, e);
            return null;
        }
    }
}
