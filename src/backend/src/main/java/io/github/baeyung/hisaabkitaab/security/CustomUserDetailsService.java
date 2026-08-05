package io.github.baeyung.hisaabkitaab.security;

import org.jspecify.annotations.NonNull;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.UserStatus;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import lombok.RequiredArgsConstructor;

/**
 * Resolves login credentials against either {@link User#getContactNumber()} or
 * {@link User#getEmail()}, so users may log in with whichever identifier they have on file.
 *
 * <p>An {@link UserStatus#INVITED} placeholder is treated as no account at all. Its password
 * is random and its contact number is unusable, so it could not authenticate regardless —
 * this just makes that explicit rather than incidental.
 */
@Service
@RequiredArgsConstructor
public class CustomUserDetailsService implements UserDetailsService
{
    private final UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(@NonNull String identifier)
    {
        User user = userRepository.findByIdentifier(identifier)
                .filter(match -> match.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(() -> new UsernameNotFoundException("No user found for " + identifier));

        return new UserPrincipal(user);
    }
}
