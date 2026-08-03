package io.github.baeyung.hisaabkitaab.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Binds the {@code {storeId}} path variable to a {@link io.github.baeyung.hisaabkitaab.entity.Store}
 * parameter, resolved <em>and ownership-checked</em> against the authenticated principal by
 * {@link CurrentStoreArgumentResolver}. A store belonging to someone else is reported as
 * {@code 404}, so a controller holding one of these can trust it unconditionally.
 *
 * <p>Annotation-driven rather than keyed on the parameter type alone: {@code StoreController}
 * already takes a {@code Store} as its {@code @RequestBody}.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface CurrentStore
{
}
