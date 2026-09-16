package io.github.baeyung.hisaabkitaab.converters;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * The one mapper every JSON column converter in this package reads and writes with.
 *
 * <p>Hibernate builds these converters itself, so the Spring-managed {@code ObjectMapper} —
 * and everything {@code spring.jackson.*} in application.yaml says about it — never reaches
 * them. Whatever a stored document needs tolerated has to be said again here, and saying it
 * once beats three private {@code new ObjectMapper()}s quietly disagreeing.
 *
 * <p>{@code FAIL_ON_NULL_FOR_PRIMITIVES} is off for the same reason it is off in the yaml: a
 * key the document did not have when it was saved reads as the record's zero value. Jackson 3
 * turned it on by default, and with it every shop arranged before
 * {@code StoreSettings.purchaseUpdatesSalePrice} existed stopped loading. A primitive added to
 * a stored record must not need a migration.
 */
final class ColumnJson
{
    static final ObjectMapper MAPPER = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private ColumnJson()
    {
    }
}
