package io.github.baeyung.hisaabkitaab.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

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
 * <p>Failures count on <em>every</em> endpoint, because Basic auth accepts credentials on every
 * endpoint — a lockout that only watched the login route would be walked around by guessing
 * against any other one. What stops an ordinary user tripping it is that repeating the *same*
 * wrong password doesn't accumulate: a device holding credentials that went stale (the password
 * was changed elsewhere) fires a burst of identical failures on one page load, and that burst is
 * worth a single attempt. A brute-forcer, who must send a different guess each time, spends the
 * whole allowance. A success clears the count, so typos spread over months never add up.
 */
@Component
@RequiredArgsConstructor
public class LoginAttemptListener
{
    private final UserRepository userRepository;

    @EventListener
    @Transactional
    public void onFailure(AuthenticationFailureBadCredentialsEvent event)
    {
        Object credentials = event.getAuthentication().getCredentials();
        if (credentials == null)
        {
            return;
        }

        // No match means the identifier belongs to no account — nothing to count against,
        // and nothing to leak.
        userRepository.findByIdentifier(event.getAuthentication().getName())
                .ifPresent(user -> userRepository.countFailedLogin(
                        user.getId(), fingerprint(user, credentials.toString())));
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
                    .ifPresent(user -> {
                        user.setFailedLoginAttempts(0);
                        user.setLastFailedCredentialHash(null);
                    });
        }
    }

    /**
     * Identifies a wrong password without storing it. Salted with the user's bcrypt hash, which
     * is per-row, random and already the most sensitive thing in that table — so this adds no
     * new exposure to a database leak, while a bare digest of a real (mistyped-elsewhere)
     * password would be worth cracking.
     */
    private static String fingerprint(User user, String attempt)
    {
        try
        {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest((user.getPasswordHash() + attempt).getBytes(StandardCharsets.UTF_8)));
        }
        catch (NoSuchAlgorithmException e)
        {
            throw new IllegalStateException("SHA-256 is required by every JVM", e);
        }
    }
}
