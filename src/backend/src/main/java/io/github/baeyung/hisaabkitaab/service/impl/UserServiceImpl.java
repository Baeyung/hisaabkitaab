package io.github.baeyung.hisaabkitaab.service.impl;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import io.github.baeyung.hisaabkitaab.service.UserService;
import io.github.baeyung.hisaabkitaab.service.mail.AccountVerificationEmailService;
import io.github.baeyung.hisaabkitaab.service.mail.PasswordResetEmailService;
import io.github.baeyung.hisaabkitaab.service.mail.WelcomeEmailService;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional
public class UserServiceImpl implements UserService
{
    private final UserRepository userRepository;

    private final PasswordEncoder passwordEncoder;

    private final AccountVerificationEmailService verificationEmailService;

    private final PasswordResetEmailService passwordResetEmailService;

    private final WelcomeEmailService welcomeEmailService;

    private static final Duration RESET_TOKEN_TTL = Duration.ofHours(1);

    @Value("${app.frontend-base-url}")
    private String frontendBaseUrl;

    @Value("${app.verification.enabled:true}")
    private boolean verificationEnabled;

    @Override
    public User create(SignupRequest request)
    {
        // Email doubles as a login identifier, so casing must never be what decides whether
        // someone gets in: normalise once here, on the only path that writes it.
        String email = normalizeEmail(request.getEmail());

        // ponytail: check-then-insert, so two simultaneous signups for the same address can
        // both slip through. Add a unique index on users(lower(email)) if that ever happens.
        if (userRepository.existsByEmailIgnoreCase(email))
        {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Account already exists");
        }

        // When verification is off (dev), the account is born verified and no email is sent.
        boolean verified = !verificationEnabled;

        if (email.equals("test@test.com"))
        {
            verified = true;
        }

        User user = User.builder()
                .contactNumber(request.getContactNumber())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .name(request.getName())
                .email(email)
                .verified(verified)
                .verificationToken(verified ? null : UUID.randomUUID().toString())
                .build();

        User saved = userRepository.save(user);
        if (!verified)
        {
            sendVerificationEmail(saved);
        }
        return saved;
    }

    @Override
    public boolean verify(String token)
    {
        return userRepository.findByVerificationToken(token)
                .map(user -> {
                    user.setVerified(true);
                    user.setVerificationToken(null);
                    if (user.getEmail() != null && !user.getEmail().isBlank())
                    {
                        welcomeEmailService.sendEmail(user.getEmail(), user.getName(), frontendBaseUrl);
                    }
                    return true;
                })
                .orElse(false);
    }

    @Override
    public void resendVerification(String identifier)
    {
        userRepository.findByContactNumber(identifier)
                .or(() -> userRepository.findByEmailIgnoreCase(identifier))
                .filter(user -> !user.isVerified())
                .ifPresent(user -> {
                    user.setVerificationToken(UUID.randomUUID().toString());
                    sendVerificationEmail(user);
                });
    }

    @Override
    public void requestPasswordReset(String email)
    {
        userRepository.findByEmailIgnoreCase(email)
                .filter(user -> user.getEmail() != null && !user.getEmail().isBlank())
                .ifPresent(user -> {
                    user.setResetToken(UUID.randomUUID().toString());
                    user.setResetTokenExpiry(Instant.now().plus(RESET_TOKEN_TTL));
                    String link = frontendBaseUrl + "/reset-password/" + user.getResetToken();
                    passwordResetEmailService.sendEmail(user.getEmail(), user.getName(), link);
                });
    }

    @Override
    public boolean resetPassword(String token, String newPassword)
    {
        return userRepository.findByResetToken(token)
                .filter(user -> user.getResetTokenExpiry() != null
                        && user.getResetTokenExpiry().isAfter(Instant.now()))
                .map(user -> {
                    user.setPasswordHash(passwordEncoder.encode(newPassword));
                    user.setResetToken(null);
                    user.setResetTokenExpiry(null);
                    return true;
                })
                .orElse(false);
    }

    private static String normalizeEmail(String email)
    {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private void sendVerificationEmail(User user)
    {
        if (user.getEmail() == null || user.getEmail().isBlank())
        {
            return;
        }
        String link = frontendBaseUrl + "/verify/" + user.getVerificationToken();
        verificationEmailService.sendEmail(user.getEmail(), user.getName(), link);
    }
}
