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

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities()
    {
        return List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }
}
