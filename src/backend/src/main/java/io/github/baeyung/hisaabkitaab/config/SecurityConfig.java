package io.github.baeyung.hisaabkitaab.config;

import io.github.baeyung.hisaabkitaab.security.RestAccessDeniedHandler;
import io.github.baeyung.hisaabkitaab.security.RestAuthenticationEntryPoint;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * HTTP Basic auth backed by {@code CustomUserDetailsService}, which resolves the
 * username against either a user's contact number or email. Sessions are stateless
 * since Basic auth re-sends credentials on every request. Signup and the email
 * verify/resend endpoints are public; every other request requires a {@code ROLE_USER}
 * authority, which an account only holds once verified — so an authenticated but
 * unverified user is denied by {@link RestAccessDeniedHandler} (403 {@code ACCOUNT_UNVERIFIED}),
 * distinct from a bad-credentials 401 from {@link RestAuthenticationEntryPoint}. CORS is
 * scoped to the Angular dev server, and both handlers return JSON so the browser never
 * shows its native Basic-auth popup.
 */
@Configuration
public class SecurityConfig
{
    private final RestAuthenticationEntryPoint authenticationEntryPoint;

    private final RestAccessDeniedHandler accessDeniedHandler;

    @Value("${app.verification.enabled:true}")
    private boolean verificationEnabled;

    public SecurityConfig(RestAuthenticationEntryPoint authenticationEntryPoint,
            RestAccessDeniedHandler accessDeniedHandler)
    {
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception
    {
        http
                .cors(cors -> {})
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> {
                    auth
                            .requestMatchers(HttpMethod.POST, "/api/auth/signup").permitAll()
                            .requestMatchers(HttpMethod.POST, "/api/auth/verify/*").permitAll()
                            .requestMatchers(HttpMethod.POST, "/api/auth/resend-verification").permitAll()
                            .requestMatchers(HttpMethod.POST, "/api/auth/forgot-password").permitAll()
                            .requestMatchers(HttpMethod.POST, "/api/auth/reset-password").permitAll();
                    // With verification on, everything else needs a *verified* account:
                    // unverified logins authenticate but hold only ROLE_UNVERIFIED, so they
                    // fall through to the 403 access-denied handler. With it off, plain
                    // authentication is enough.
                    if (verificationEnabled)
                    {
                        auth.anyRequest().hasRole("USER");
                    }
                    else
                    {
                        auth.anyRequest().authenticated();
                    }
                })
                .httpBasic(basic -> basic.authenticationEntryPoint(authenticationEntryPoint))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler));

        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource()
    {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("http://localhost:4200"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
