package io.github.baeyung.hisaabkitaab.service.impl;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import io.github.baeyung.hisaabkitaab.service.UserService;
import io.github.baeyung.hisaabkitaab.service.mail.AccountVerificationEmailService;
import io.github.baeyung.hisaabkitaab.service.mail.PasswordResetEmailService;
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

    private static final Duration RESET_TOKEN_TTL = Duration.ofHours(1);

    @Value("${app.frontend-base-url}")
    private String frontendBaseUrl;

    @Value("${app.verification.enabled:true}")
    private boolean verificationEnabled;

    @Override
    public User create(SignupRequest request)
    {
        // When verification is off (dev), the account is born verified and no email is sent.
        boolean verified = !verificationEnabled;

        User user = User.builder()
                .contactNumber(request.getContactNumber())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .name(request.getName())
                .email(request.getEmail())
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
                    return true;
                })
                .orElse(false);
    }

    @Override
    public void resendVerification(String identifier)
    {
        userRepository.findByContactNumber(identifier)
                .or(() -> userRepository.findByEmail(identifier))
                .filter(user -> !user.isVerified())
                .ifPresent(user -> {
                    user.setVerificationToken(UUID.randomUUID().toString());
                    sendVerificationEmail(user);
                });
    }

    @Override
    public void requestPasswordReset(String email)
    {
        userRepository.findByEmail(email)
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
