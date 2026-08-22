package io.github.baeyung.hisaabkitaab.config;

import io.github.baeyung.hisaabkitaab.security.UserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Puts the caller into the MDC under {@link #USER}, so a log line can say <em>who</em> and
 * not only <em>what</em>. On a shared shop that is the difference between "somebody deleted
 * the party" and an answer.
 *
 * <p>Ordered after Spring Security's chain (which registers at −100) rather than beside
 * {@link RequestLogFilter}, because the identity does not exist until the credentials have
 * been checked — this far in it does, and it is still early enough that every controller and
 * service line inherits it. Nothing is cleaned up here on purpose: {@link RequestLogFilter}
 * wraps this one, reads the value for its departure line, and clears the whole MDC once.
 *
 * <p>The name, not the id: a UUID in the log means another query before anyone can act on
 * it, while the contact number or email is what the person reporting the problem will say.
 */
@Component
@Order(0)
public class PrincipalMdcFilter extends OncePerRequestFilter
{
    public static final String USER = "user";

    /** Reads on the way in — anonymous, and the only honest thing to call it. */
    public static final String ANONYMOUS = "anonymous";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException
    {
        MDC.put(USER, currentUser());
        chain.doFilter(request, response);
    }

    private static String currentUser()
    {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        // An anonymous token is still "authenticated" as far as Spring is concerned, and its
        // name is the literal "anonymousUser" — neither is worth putting in a log line.
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken)
        {
            return ANONYMOUS;
        }

        // An account with no email on file (an invited placeholder that never signed up) falls
        // back to whatever identifier was typed, so the field is never blank.
        if (authentication.getPrincipal() instanceof UserPrincipal principal
                && principal.getUsername() != null
                && !principal.getUsername().isBlank())
        {
            return principal.getUsername();
        }

        return authentication.getName();
    }
}
