package io.github.baeyung.hisaabkitaab.security;

import java.util.Collection;
import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import io.github.baeyung.hisaabkitaab.entity.User;
import lombok.Getter;

@Getter
public class UserPrincipal implements UserDetails
{
    /** Consecutive wrong passwords that lock the account. */
    public static final int MAX_FAILED_LOGIN_ATTEMPTS = 4;

    private final String id;

    private final String username;

    private final String password;

    private final User user;

    /** Whether this account's email is listed in {@code app.admin.emails}. */
    private final boolean admin;

    public UserPrincipal(User user, boolean admin)
    {
        this.id = user.getId();
        this.username = user.getEmail();
        this.password = user.getPasswordHash();
        this.user = user;
        this.admin = admin;
    }

    /**
     * A verified account gets {@code ROLE_USER}; an unverified one gets only
     * {@code ROLE_UNVERIFIED}. The password still authenticates either way — the
     * missing role is what makes protected endpoints answer 403 (not 401) for an
     * authenticated-but-unverified user, without leaking verification state on a
     * wrong password.
     *
     * <p>A configured admin additionally gets {@code ROLE_ADMIN}, but only once verified:
     * admin rights ride on a real, confirmed HisaabKitaab account, so claiming the address
     * is not enough to hold the panel.
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities()
    {
        if (!user.isVerified())
        {
            return List.of(new SimpleGrantedAuthority("ROLE_UNVERIFIED"));
        }

        return admin
                ? List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("ROLE_ADMIN"))
                : List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }

    /**
     * An account an admin has locked out. Spring checks this before the password, so the
     * block lands on every endpoint at once — Basic auth re-authenticates on each request,
     * so there is no session to outlive it. Surfaces as {@code ACCOUNT_DISABLED} at
     * {@link RestAuthenticationEntryPoint}.
     */
    @Override
    public boolean isEnabled()
    {
        return !user.isDisabled();
    }

    /**
     * Spring checks this <em>before</em> the password, so once locked even the right password
     * fails with {@code LockedException} — only a password reset clears the count.
     */
    @Override
    public boolean isAccountNonLocked()
    {
        return user.getFailedLoginAttempts() < MAX_FAILED_LOGIN_ATTEMPTS;
    }
}
