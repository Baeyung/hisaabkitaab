package io.github.baeyung.hisaabkitaab.security;

import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import io.github.baeyung.hisaabkitaab.service.PlanService;
import lombok.RequiredArgsConstructor;

/**
 * Turns {@link RequiresPlanCapacity} into an actual refusal. This is the whole of plan
 * enforcement on the write paths: nothing else in the application asks whether a plan has room,
 * so a limit changes in one place and a new limit is one annotation rather than an edit to
 * whatever service happens to own the operation.
 *
 * <p>The caller comes from the security context, not the advised method's arguments. That is
 * what lets one piece of advice cover methods with nothing in common in their signatures — and
 * it is safe because {@link RequiresPlanCapacity} may only be put on a method that already runs
 * as the owner (see its javadoc).
 *
 * <p>The {@code app.plans.enabled} switch is <em>not</em> read here. It lives once, in
 * {@link PlanService}, and this advice runs unconditionally into a call that returns
 * immediately when plans are off — one switch to find and one behaviour to reason about, at
 * the cost of a method call on the two operations that create a store or invite a user.
 */
@Aspect
@Component
@RequiredArgsConstructor
public class PlanCapacityAspect
{
    private final PlanService planService;

    @Before("@annotation(required)")
    public void enforce(RequiresPlanCapacity required)
    {
        planService.requireCapacity(currentUserId(), required.value());
    }

    /**
     * @throws IllegalStateException if there is no authenticated user — that means the
     *         annotation reached a background or startup path it was never meant for, which is
     *         a wiring bug and must not read to the caller as a plan problem.
     */
    private static String currentUserId()
    {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal))
        {
            throw new IllegalStateException(
                    "@RequiresPlanCapacity reached with no authenticated user in the security context");
        }

        return principal.getId();
    }
}
