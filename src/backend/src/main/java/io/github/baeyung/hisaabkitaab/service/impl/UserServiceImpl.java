package io.github.baeyung.hisaabkitaab.service.impl;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
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

    private static final Duration VERIFICATION_CODE_TTL = Duration.ofMinutes(10);

    private static final int MAX_VERIFICATION_ATTEMPTS = 5;

    private static final SecureRandom RANDOM = new SecureRandom();

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
                .build();

        if (!verified)
        {
            issueVerificationCode(user);
        }

        User saved = userRepository.save(user);
        if (!verified)
        {
            sendVerificationEmail(saved);
        }
        return saved;
    }

    @Override
    public boolean verify(String identifier, String otp)
    {
        Optional<User> match = findByIdentifier(identifier).filter(user -> !user.isVerified());
        if (match.isEmpty())
        {
            return false;
        }
        User user = match.get();

        // No live code: never issued, already used, expired, or burned by too many guesses.
        // All four mean the same thing to the caller — ask for a new code.
        if (user.getVerificationToken() == null
                || user.getVerificationTokenExpiry() == null
                || user.getVerificationTokenExpiry().isBefore(Instant.now())
                || user.getVerificationAttempts() >= MAX_VERIFICATION_ATTEMPTS)
        {
            return false;
        }

        if (!user.getVerificationToken().equals(otp))
        {
            user.setVerificationAttempts(user.getVerificationAttempts() + 1);
            if (user.getVerificationAttempts() >= MAX_VERIFICATION_ATTEMPTS)
            {
                user.setVerificationToken(null);
                user.setVerificationTokenExpiry(null);
            }
            return false;
        }

        user.setVerified(true);
        user.setVerificationToken(null);
        user.setVerificationTokenExpiry(null);
        user.setVerificationAttempts(0);
        if (user.getEmail() != null && !user.getEmail().isBlank())
        {
            welcomeEmailService.sendEmail(user.getEmail(), user.getName(), frontendBaseUrl);
        }
        return true;
    }

    @Override
    public void resendVerification(String identifier)
    {
        findByIdentifier(identifier)
                .filter(user -> !user.isVerified())
                .ifPresent(user -> {
                    issueVerificationCode(user);
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

    /** Email doubles as a login identifier, so verification accepts either one. */
    private Optional<User> findByIdentifier(String identifier)
    {
        return userRepository.findByContactNumber(identifier)
                .or(() -> userRepository.findByEmailIgnoreCase(identifier));
    }

    /** Replaces any existing code with a fresh one, clearing the previous guess count. */
    private static void issueVerificationCode(User user)
    {
        user.setVerificationToken(String.format("%06d", RANDOM.nextInt(1_000_000)));
        user.setVerificationTokenExpiry(Instant.now().plus(VERIFICATION_CODE_TTL));
        user.setVerificationAttempts(0);
    }

    private void sendVerificationEmail(User user)
    {
        if (user.getEmail() == null || user.getEmail().isBlank())
        {
            return;
        }
        verificationEmailService.sendEmail(user.getEmail(), user.getName(), user.getVerificationToken());
    }
}
