package io.github.baeyung.hisaabkitaab.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/**
 * Returns 401 without a {@code WWW-Authenticate} header so browsers never show
 * the native Basic-auth popup on a failed programmatic login from the SPA.
 *
 * <p>Two failures carry a code the SPA acts on. A {@link LockedException} — too many wrong
 * passwords, see {@link LoginAttemptListener} — is {@code ACCOUNT_LOCKED}, which points the
 * user at the password reset that unlocks it. A {@link DisabledException} — an admin shut
 * the account — is {@code ACCOUNT_DISABLED}, which has no self-service way out and tells the
 * user to get in touch. Everything else is an indistinguishable bad-credentials 401.
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
        response.getWriter().write(switch (authException)
        {
            case LockedException ignored ->
                    "{\"status\":401,\"error\":\"ACCOUNT_LOCKED\",\"message\":\"Account locked\"}";
            case DisabledException ignored ->
                    "{\"status\":401,\"error\":\"ACCOUNT_DISABLED\",\"message\":\"Account disabled\"}";
            default -> "{\"status\":401,\"error\":\"Unauthorized\",\"message\":\"Invalid credentials\"}";
        });
    }
}
