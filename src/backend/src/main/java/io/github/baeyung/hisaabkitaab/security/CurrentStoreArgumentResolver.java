package io.github.baeyung.hisaabkitaab.security;

import java.util.Map;

import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.HandlerMapping;

import io.github.baeyung.hisaabkitaab.entity.Store;
import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import io.github.baeyung.hisaabkitaab.exception.ResourceNotFoundException;
import io.github.baeyung.hisaabkitaab.service.PlanService;
import io.github.baeyung.hisaabkitaab.service.StoreService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

/**
 * Resolves {@code @CurrentStore Store} from the {@code {storeId}} path variable, refusing
 * (404) anything the caller has no access to and (403) anything their role is too weak for.
 * This is the single tenant boundary for every store-scoped endpoint: past it, services
 * scope on the store id alone and never re-check who is asking. Being the only way to obtain
 * a {@code Store} in a controller, it cannot be forgotten on a new endpoint the way a
 * hand-written check can — and since {@link CurrentStore#value()} defaults to
 * {@code OWNER}, forgetting to state a level fails closed.
 */
@Component
@RequiredArgsConstructor
public class CurrentStoreArgumentResolver implements HandlerMethodArgumentResolver
{
    private static final Logger log = LoggerFactory.getLogger(CurrentStoreArgumentResolver.class);

    private final StoreService storeService;

    private final PlanService planService;

    @Override
    public boolean supportsParameter(MethodParameter parameter)
    {
        return parameter.hasParameterAnnotation(CurrentStore.class)
                && Store.class.isAssignableFrom(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            @NonNull MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            @NonNull NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory
    )
    {
        String storeId = pathVariables(webRequest).get("storeId");
        if (storeId == null)
        {
            // A mapping took @CurrentStore without a {storeId} segment — a wiring bug, not a
            // client error, so it must not read as "no such store".
            throw new IllegalStateException(
                    "@CurrentStore requires a {storeId} path variable on " + parameter.getMethod()
            );
        }

        UserPrincipal principal = principal(webRequest);
        if (principal == null)
        {
            // Reported to the caller as a missing store so nothing is leaked; here it is what
            // it is, which is a request that reached a store-scoped handler with nobody on it.
            log.warn("no principal on a request for store {} — answering 404", storeId);
            throw ResourceNotFoundException.forEntity("Store", storeId);
        }

        CurrentStore annotation = parameter.getParameterAnnotation(CurrentStore.class);
        Store store = storeService.findByIdForUser(storeId, principal.getId(), annotation.value());

        log.debug("resolved store {} \"{}\" for user {} (needs {})",
                storeId, store.getName(), principal.getId(), annotation.value());

        // Keyed on the HTTP method rather than the required role, because the role does not
        // say which way the data flows: the member list is a GET that needs OWNER. A closed
        // shop stays wholly readable, so only the methods that change something are asked.
        if (!annotation.allowLocked() && isWrite(webRequest))
        {
            planService.requireWritable(store);
        }

        return store;
    }

    private static boolean isWrite(NativeWebRequest request)
    {
        String method = request.getNativeRequest(HttpServletRequest.class) == null
                ? null
                : request.getNativeRequest(HttpServletRequest.class).getMethod();

        // Anything we cannot identify counts as a write: failing closed is the same choice
        // @CurrentStore already makes by defaulting to OWNER.
        return !"GET".equals(method) && !"HEAD".equals(method) && !"OPTIONS".equals(method);
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> pathVariables(NativeWebRequest request)
    {
        Object vars = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE,
                RequestAttributes.SCOPE_REQUEST);
        return vars instanceof Map ? (Map<String, String>) vars : Map.of();
    }

    private UserPrincipal principal(NativeWebRequest request)
    {
        return request.getUserPrincipal() instanceof org.springframework.security.core.Authentication auth
                && auth.getPrincipal() instanceof UserPrincipal user
                        ? user
                        : null;
    }
}
