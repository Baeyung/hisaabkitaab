package io.github.baeyung.hisaabkitaab.admin;

import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Who may use the admin app. There is no admin flag on a user row: an admin is an ordinary
 * verified HisaabKitaab account whose email is named in {@code app.admin.emails}, so admin
 * rights are granted by configuration and can be moved between environments without a
 * database write. Read by {@code CustomUserDetailsService} to hand out {@code ROLE_ADMIN},
 * and by {@link AdminUserService} to stop one admin locking another out.
 */
@Component
public class AdminAccounts
{
    private final Set<String> emails;

    public AdminAccounts(@Value("${app.admin.emails:}") Set<String> emails)
    {
        this.emails = emails.stream()
                .map(email -> email.trim().toLowerCase(Locale.ROOT))
                .filter(email -> !email.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public boolean isAdmin(String email)
    {
        return email != null && emails.contains(email.trim().toLowerCase(Locale.ROOT));
    }
}
