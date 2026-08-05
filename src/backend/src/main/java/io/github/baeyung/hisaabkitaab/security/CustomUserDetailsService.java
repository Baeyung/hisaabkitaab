package io.github.baeyung.hisaabkitaab.security;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.UserStatus;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;

/**
 * Resolves login credentials against either {@link User#getContactNumber()} or
 * {@link User#getEmail()}, so users may log in with whichever identifier they have on file.
 *
 * <p>An {@link UserStatus#INVITED} placeholder is treated as no account at all. Its password
 * is random and its contact number is unusable, so it could not authenticate regardless —
 * this just makes that explicit rather than incidental.
 *
 * <p>This is also where back-office access is decided: an account whose email is listed in
 * {@code app.admin.emails} <em>and</em> which is verified is marked as an admin. There is no
 * admin flag in the database on purpose — the list is deployment configuration, so revoking
 * access is a restart rather than a migration, and a compromised database cannot mint one.
 */
@Service
public class CustomUserDetailsService implements UserDetailsService
{
    private final UserRepository userRepository;

    /** Lower-cased once at construction, since {@code users.email} casing is not guaranteed. */
    private final Set<String> adminEmails;

    public CustomUserDetailsService(UserRepository userRepository,
            @Value("${app.admin.emails:}") List<String> adminEmails)
    {
        this.userRepository = userRepository;
        this.adminEmails = adminEmails.stream()
                .map(email -> email.trim().toLowerCase(Locale.ROOT))
                .filter(email -> !email.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public UserDetails loadUserByUsername(@NonNull String identifier)
    {
        User user = userRepository.findByIdentifier(identifier)
                .filter(match -> match.getStatus() == UserStatus.ACTIVE)
                .orElseThrow(() -> new UsernameNotFoundException("No user found for " + identifier));

        return new UserPrincipal(user, isAdmin(user));
    }

    private boolean isAdmin(User user)
    {
        return user.isVerified()
                && user.getEmail() != null
                && adminEmails.contains(user.getEmail().toLowerCase(Locale.ROOT));
    }
}
