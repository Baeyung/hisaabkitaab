package io.github.baeyung.hisaabkitaab.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
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
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException
    {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write(body(authException));
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
