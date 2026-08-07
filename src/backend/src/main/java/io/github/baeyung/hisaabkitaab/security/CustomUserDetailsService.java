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
import io.github.baeyung.hisaabkitaab.service.PlanService;

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
 *
 * <p>And it is where an account's plan is checked, via {@code PlanService.isLoginAllowed}. Auth
 * is stateless Basic, so this runs on every request rather than once at sign-in — which costs
 * one keyed lookup per request, and in exchange is what makes a lapsed plan take effect on the
 * account's very next call instead of whenever it next happens to log in.
 */
@Service
public class CustomUserDetailsService implements UserDetailsService
{
    private final UserRepository userRepository;

    private final PlanService planService;

    /** Lower-cased once at construction, since {@code users.email} casing is not guaranteed. */
    private final Set<String> adminEmails;

    public CustomUserDetailsService(UserRepository userRepository, PlanService planService,
            @Value("${app.admin.emails:}") List<String> adminEmails)
    {
        this.userRepository = userRepository;
        this.planService = planService;
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

        boolean admin = isAdmin(user);

        return new UserPrincipal(user, admin, planService.isLoginAllowed(user, admin));
    }

    private boolean isAdmin(User user)
    {
        return user.isVerified()
                && user.getEmail() != null
                && adminEmails.contains(user.getEmail().toLowerCase(Locale.ROOT));
    }
}
