package io.github.baeyung.hisaabkitaab.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AccountExpiredException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Returns 401 without a {@code WWW-Authenticate} header so browsers never show
 * the native Basic-auth popup on a failed programmatic login from the SPA.
 *
 * <p>Two failures carry a code the SPA keys on rather than being reported as bad credentials,
 * because in both the password is beside the point and retrying it cannot help:
 *
 * <ul>
 *   <li>{@link LockedException} — too many wrong passwords, see {@link LoginAttemptListener} —
 *       becomes {@code ACCOUNT_LOCKED}, which points the user at the password reset that
 *       unlocks the account.
 *   <li>{@link AccountExpiredException} — the account's plan has run out, see
 *       {@code UserPrincipal.isAccountNonExpired()} — becomes {@code PLAN_EXPIRED}, which
 *       points them at renewing rather than at their own typing.
 * </ul>
 *
 * <p>Everything else is an indistinguishable bad-credentials 401.
 */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint
{
    private static final Logger log = LoggerFactory.getLogger(RestAuthenticationEntryPoint.class);

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException
    {
        // The three cases answer the caller differently and are worth telling apart in the
        // log too: a locked account and a lapsed plan are support calls that the SPA's own
        // error screen cannot explain on its own, a bad password is not.
        log.warn("401 on {} {} as \"{}\": {}", request.getMethod(), request.getRequestURI(),
                attemptedUser(request), authException.getClass().getSimpleName());

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write(body(authException));
    }

    /**
     * Who the caller <em>claimed</em> to be. Nothing is authenticated at this point, so there
     * is no principal to ask — the identifier has to come back out of the credentials that
     * just failed. Only the identifier: the password half is dropped without being read, and
     * a malformed header simply yields nothing rather than being reported.
     */
    private static String attemptedUser(HttpServletRequest request)
    {
        String header = request.getHeader("Authorization");
        if (header == null || !header.regionMatches(true, 0, "Basic ", 0, 6))
        {
            return "anonymous";
        }

        try
        {
            String decoded = new String(
                    Base64.getDecoder().decode(header.substring(6).trim()), StandardCharsets.UTF_8);
            int separator = decoded.indexOf(':');
            return separator < 0 ? "unreadable" : decoded.substring(0, separator);
        }
        catch (IllegalArgumentException ex)
        {
            return "unreadable";
        }
    }

    private String body(AuthenticationException authException)
    {
        if (authException instanceof LockedException)
        {
            return "{\"status\":401,\"error\":\"ACCOUNT_LOCKED\",\"message\":\"Account locked\"}";
        }
        if (authException instanceof AccountExpiredException)
        {
            return "{\"status\":401,\"error\":\"PLAN_EXPIRED\",\"message\":\"Plan expired\"}";
        }

        return "{\"status\":401,\"error\":\"Unauthorized\",\"message\":\"Invalid credentials\"}";
    }
}
