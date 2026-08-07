package io.github.baeyung.hisaabkitaab.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import io.github.baeyung.hisaabkitaab.enums.StoreRole;

/**
 * Binds the {@code {storeId}} path variable to a {@link io.github.baeyung.hisaabkitaab.entity.Store}
 * parameter, resolved <em>and access-checked</em> against the authenticated principal by
 * {@link CurrentStoreArgumentResolver}. A store the caller cannot reach at all is reported as
 * {@code 404}, one they can reach but not at {@link #value} as {@code 403} — so a controller
 * holding one of these can trust it unconditionally.
 *
 * <p>The default is {@link StoreRole#OWNER}, the strictest level: a new endpoint that forgets
 * to say what it needs refuses everyone but the owner rather than quietly letting a viewer
 * through. Every mapping states its level explicitly.
 *
 * <p>Annotation-driven rather than keyed on the parameter type alone: {@code StoreController}
 * already takes a {@code Store} as its {@code @RequestBody}.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface CurrentStore
{
    /** The weakest role that may reach this endpoint. */
    StoreRole value() default StoreRole.OWNER;

    /**
     * Lets this endpoint through even when the plan has the shop closed. Only the way
     * <em>out</em> of that state qualifies: deleting the shop, and removing the people whose
     * seats are over the ceiling. Without it those two would be refused by the very check
     * they exist to satisfy, and the owner would have no move left.
     *
     * <p>Defaults false, and only ever applies to a write — reads are never refused for a
     * closed shop in the first place (see {@code PlanService.requireWritable}).
     */
    boolean allowLocked() default false;
}
