package io.github.baeyung.hisaabkitaab.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/**
 * Fires when a request is authenticated (password matched) but lacks {@code ROLE_USER} —
 * which, in this app, only ever means an unverified account. Returns 403 with the
 * {@code ACCOUNT_UNVERIFIED} code the SPA keys on to route to the verification screen.
 * A wrong password never reaches here (it fails as 401 at {@link RestAuthenticationEntryPoint}),
 * so verification state is not leaked on a failed login.
 */
@Component
public class RestAccessDeniedHandler implements AccessDeniedHandler
{
    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException
    {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"status\":403,\"error\":\"ACCOUNT_UNVERIFIED\",\"message\":\"Account not verified\"}");
    }
}
