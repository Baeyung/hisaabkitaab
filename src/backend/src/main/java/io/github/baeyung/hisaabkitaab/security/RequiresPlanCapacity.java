package io.github.baeyung.hisaabkitaab.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import io.github.baeyung.hisaabkitaab.enums.PlanCapacity;

/**
 * Refuses the annotated call unless the caller's own plan is active and has room for one more
 * of {@link #value()}. Enforced by {@link PlanCapacityAspect}, which is the single place every
 * limit is actually checked — a marked method carries no plan logic of its own and does not
 * know a plan exists.
 *
 * <p>Goes on the <em>implementation</em> method, not an interface: Spring Boot proxies with
 * CGLIB, and an annotation left on the interface would silently never match.
 *
 * <p>The caller is read from the security context rather than the method's arguments, so this
 * only belongs on a method that already runs as the account being charged for the thing — the
 * store's owner. Both current sites qualify: creating a store makes the caller its owner, and
 * inviting a member is reachable only behind {@code @CurrentStore(OWNER)}.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresPlanCapacity
{
    PlanCapacity value();
}
