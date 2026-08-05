package io.github.baeyung.hisaabkitaab.security;

import java.util.Map;

import org.jspecify.annotations.NonNull;
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
import io.github.baeyung.hisaabkitaab.service.StoreService;
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
    private final StoreService storeService;

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
            throw ResourceNotFoundException.forEntity("Store", storeId);
        }

        StoreRole required = parameter.getParameterAnnotation(CurrentStore.class).value();
        return storeService.findByIdForUser(storeId, principal.getId(), required);
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
