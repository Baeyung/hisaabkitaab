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
    private final String id;

    private final String username;

    private final String password;

    private final User user;

    public UserPrincipal(User user)
    {
        this.id = user.getId();
        this.username = user.getEmail();
        this.password = user.getPasswordHash();
        this.user = user;
    }

    /**
     * A verified account gets {@code ROLE_USER}; an unverified one gets only
     * {@code ROLE_UNVERIFIED}. The password still authenticates either way — the
     * missing role is what makes protected endpoints answer 403 (not 401) for an
     * authenticated-but-unverified user, without leaking verification state on a
     * wrong password.
     */
    @Override
    public Collection<? extends GrantedAuthority> getAuthorities()
    {
        return List.of(new SimpleGrantedAuthority(user.isVerified() ? "ROLE_USER" : "ROLE_UNVERIFIED"));
    }
}
