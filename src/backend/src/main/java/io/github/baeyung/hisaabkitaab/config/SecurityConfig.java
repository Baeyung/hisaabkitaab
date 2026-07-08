package io.github.baeyung.hisaabkitaab.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Placeholder security configuration: permits all requests so the CRUD REST API is
 * reachable before real authentication/authorization is implemented. Replace with
 * proper auth (e.g. JWT/session login backed by {@code UserRepository}) before this
 * app is exposed beyond local development.
 */
@Configuration
public class SecurityConfig
{
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception
    {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());

        return http.build();
    }
}
