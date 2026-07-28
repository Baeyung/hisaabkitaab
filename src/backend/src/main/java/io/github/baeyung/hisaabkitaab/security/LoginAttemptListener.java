package io.github.baeyung.hisaabkitaab.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.event.EventListener;
import org.springframework.security.authentication.event.AuthenticationFailureBadCredentialsEvent;
import org.springframework.security.authentication.event.AuthenticationSuccessEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import lombok.RequiredArgsConstructor;

/**
 * Maintains {@link User#getFailedLoginAttempts()}, the counter that
 * {@link UserPrincipal#isAccountNonLocked()} reads to lock an account out.
 *
 * <p>Only failures against {@code /api/auth/me} count. Basic auth re-sends credentials on
 * every request, so counting all of them would let a single page load with a stale password
 * burn through the whole allowance at once; {@code /me} is the one call the SPA makes to log
 * in, which is what a user means by "a login attempt". A success clears the count, so ordinary
 * typos spread over months never accumulate into a lock.
 */
@Component
@RequiredArgsConstructor
public class LoginAttemptListener
{
    /** Path the SPA hits to log in — the only failures that count toward a lockout. */
    private static final String LOGIN_PATH = "/api/auth/me";

    private final UserRepository userRepository;

    /** Request-scoped proxy: resolves to whichever request is on the current thread. */
    private final HttpServletRequest request;

    @EventListener
    @Transactional
    public void onFailure(AuthenticationFailureBadCredentialsEvent event)
    {
        if (!LOGIN_PATH.equals(request.getRequestURI()))
        {
            return;
        }
        // No match means the identifier belongs to no account — nothing to count against,
        // and nothing to leak.
        userRepository.findByIdentifier(event.getAuthentication().getName())
                .ifPresent(user -> user.setFailedLoginAttempts(user.getFailedLoginAttempts() + 1));
    }

    @EventListener
    @Transactional
    public void onSuccess(AuthenticationSuccessEvent event)
    {
        // Fires on every authenticated request, so skip the write unless there is a count to
        // clear. The entity is already loaded by this point, making the check free.
        if (event.getAuthentication().getPrincipal() instanceof UserPrincipal principal
                && principal.getUser().getFailedLoginAttempts() > 0)
        {
            userRepository.findById(principal.getId())
                    .ifPresent(user -> user.setFailedLoginAttempts(0));
        }
    }
}
