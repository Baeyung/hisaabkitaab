package io.github.baeyung.hisaabkitaab.converters;

import io.github.baeyung.hisaabkitaab.models.ValueMetaData;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import tools.jackson.databind.ObjectMapper;

@Converter
public class ValueMetaDataConverter implements AttributeConverter<ValueMetaData, String>
{
    @Override
    public String convertToDatabaseColumn(ValueMetaData attribute)
    {
        try
        {
            if (attribute == null)
            {
                return null;
            }

            return new ObjectMapper().writeValueAsString(attribute);
        }
        catch (Exception e)
        {
            System.out.println("failed to convert ValueMetaData to String" + e);
            return null;
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

            return new ObjectMapper().readValue(dbData, ValueMetaData.class);
        }
        catch (Exception e)
        {
            System.out.println("failed to convert String to ValueMetaData" + e);
            return null;
        }
    }
}
