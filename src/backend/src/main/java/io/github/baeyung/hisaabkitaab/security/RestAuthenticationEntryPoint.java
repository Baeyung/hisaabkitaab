package io.github.baeyung.hisaabkitaab.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Returns 401 without a {@code WWW-Authenticate} header so browsers never show
 * the native Basic-auth popup on a failed programmatic login from the SPA.
 *
 * <p>A {@link LockedException} — too many wrong passwords, see {@link LoginAttemptListener} —
 * carries the {@code ACCOUNT_LOCKED} code the SPA keys on to point the user at the password
 * reset that unlocks the account. Everything else is an indistinguishable bad-credentials 401.
 */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint
{
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException
    {
        boolean locked = authException instanceof LockedException;

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write(locked
                ? "{\"status\":401,\"error\":\"ACCOUNT_LOCKED\",\"message\":\"Account locked\"}"
                : "{\"status\":401,\"error\":\"Unauthorized\",\"message\":\"Invalid credentials\"}");
    }
}
