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

    /** Whether this account is named in {@code app.admin.emails}; see {@link #getAuthorities()}. */
    private final boolean admin;

    /** Whether a live plan covers this account; see {@link #isAccountNonExpired()}. */
    private final boolean planActive;

    public UserPrincipal(User user, boolean admin, boolean planActive)
    {
        this.id = user.getId();
        this.username = user.getEmail();
        this.password = user.getPasswordHash();
        this.user = user;
        this.admin = admin;
        this.planActive = planActive;
    }

    /**
     * A verified account gets {@code ROLE_USER}; an unverified one gets only
     * {@code ROLE_UNVERIFIED}. The password still authenticates either way — the
     * missing role is what makes protected endpoints answer 403 (not 401) for an
     * authenticated-but-unverified user, without leaking verification state on a
     * wrong password.
     *
     * <p>A listed admin additionally gets {@code ROLE_ADMIN}, and only ever alongside
     * {@code ROLE_USER} — {@code CustomUserDetailsService} withholds it from an unverified
     * account, so the back office cannot be reached from an address someone merely claimed.
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities()
    {
        SimpleGrantedAuthority role =
                new SimpleGrantedAuthority(user.isVerified() ? "ROLE_USER" : "ROLE_UNVERIFIED");

        return admin
                ? List.of(role, new SimpleGrantedAuthority("ROLE_ADMIN"))
                : List.of(role);
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

    /**
     * False once the account's plan has run out, which Spring turns into
     * {@code AccountExpiredException} and {@link RestAuthenticationEntryPoint} reports as 401
     * {@code PLAN_EXPIRED}. Decided by {@code PlanService.isLoginAllowed} — including whether a
     * shop shared by a paid-up owner covers a user whose own plan lapsed — and merely carried
     * here, because this is the hook Spring Security already asks.
     *
     * <p>Checked before the password, like {@link #isAccountNonLocked()}, so a lapsed account is
     * told so even on a wrong password. That is the same trade already accepted for a locked
     * account: the alternative is a user retrying a password that was never the problem.
     */
    @Override
    public boolean isAccountNonExpired()
    {
        return planActive;
    }
}
