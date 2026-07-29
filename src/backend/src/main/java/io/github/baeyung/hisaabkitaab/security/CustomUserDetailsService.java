package io.github.baeyung.hisaabkitaab.security;

import org.jspecify.annotations.NonNull;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import io.github.baeyung.hisaabkitaab.admin.AdminAccounts;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import lombok.RequiredArgsConstructor;

/**
 * Resolves login credentials against either {@link User#getContactNumber()} or
 * {@link User#getEmail()}, so users may log in with whichever identifier they have on file.
 *
 * <p>Also the point where an ordinary account is recognised as an admin: the email is
 * matched against the configured allowlist and the answer travels on the principal, so the
 * check runs once per request instead of at every admin endpoint.
 */
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService
{
    private final UserRepository userRepository;

    private final AdminAccounts adminAccounts;

    @Override
    public UserDetails loadUserByUsername(@NonNull String identifier)
    {
        User user = userRepository.findByIdentifier(identifier)
                .orElseThrow(() -> new UsernameNotFoundException("No user found for " + identifier));

        return new UserPrincipal(user, adminAccounts.isAdmin(user.getEmail()));
    }
}
