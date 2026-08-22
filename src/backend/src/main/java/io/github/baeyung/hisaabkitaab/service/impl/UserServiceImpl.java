package io.github.baeyung.hisaabkitaab.service.impl;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.dto.user.ProfileRequest;
import io.github.baeyung.hisaabkitaab.entity.User;
import io.github.baeyung.hisaabkitaab.enums.UserStatus;
import io.github.baeyung.hisaabkitaab.repository.UserRepository;
import io.github.baeyung.hisaabkitaab.service.PlanService;
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
    /**
     * Never carries a code or a password — only the reason a call ended the way it did.
     * Several methods below answer the caller with a bare {@code false} on purpose (telling
     * them <em>why</em> would say whether an account exists), which leaves the log as the only
     * place the real reason can be written down.
     */
    private static final Logger log = LoggerFactory.getLogger(UserServiceImpl.class);

    private final UserRepository userRepository;

    private final PasswordEncoder passwordEncoder;

    private final AccountVerificationEmailService verificationEmailService;

    private final PasswordResetEmailService passwordResetEmailService;

    private final WelcomeEmailService welcomeEmailService;

    private final PlanService planService;

    private static final Duration OTP_TTL = Duration.ofMinutes(10);

    /**
     * How long a freshly issued code blocks another send. Both endpoints that mail a code are
     * unauthenticated and take an address from the caller, so without this anyone can bomb a
     * known inbox — and burn the mail quota — by replaying the request.
     *
     * <p>Deliberately shorter than the resend button's own countdown on the verify screen
     * (RESEND_COOLDOWN_SECONDS in verify-pending.ts): the button is the one a real user waits
     * for, and if this window outlasted it their click would be swallowed with no mail and no
     * explanation. Keep it under that value if either changes.
     */
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(30);

    /** Shared by both codes: 6 digits is only 1M combinations, so guessing has to be capped. */
    private static final int MAX_OTP_ATTEMPTS = 5;

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
        Optional<User> existing = userRepository.findByEmailIgnoreCase(email);
        if (existing.filter(user -> user.getStatus() == UserStatus.ACTIVE).isPresent())
        {
            log.warn("signup refused for {}: an active account already holds that address", email);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Account already exists");
        }

        // When verification is off (dev), the account is born verified and no email is sent.
        boolean verified = !verificationEnabled;

        if (email.equals("test@test.com"))
        {
            verified = true;
        }

        // An INVITED row is a placeholder a shop owner created when they shared a store with
        // this address. Adopting it — same row, same id — is what carries that access through
        // signup; a fresh account would leave the shop stranded on an id nobody logs in as.
        if (existing.isPresent())
        {
            log.info("signup for {} adopts the invited placeholder {}", email, existing.get().getId());
        }

        User user = existing.orElseGet(User::new);
        user.setContactNumber(request.getContactNumber());
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setName(request.getName());
        user.setEmail(email);
        user.setVerified(verified);
        user.setStatus(UserStatus.ACTIVE);

        if (!verified)
        {
            issueVerificationCode(user);
        }

        User saved = userRepository.save(user);

        // Here rather than at verification, and here rather than where the INVITED placeholder
        // was first created: the trial clock should start when a person actually signs up, not
        // when a shop owner typed their address, and not only if they get around to verifying.
        planService.startTrial(saved);

        log.info("signed up account {} ({}), verified={}", saved.getId(), email, verified);

        if (!verified)
        {
            sendVerificationEmail(saved);
        }
        return saved;
    }

    @Override
    public User updateProfile(String userId, ProfileRequest request)
    {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account not found"));

        String contactNumber = request.contactNumber().trim();

        // Unique in the database and usable as a username, so a collision has to be answered
        // here rather than as a constraint violation on flush.
        if (!contactNumber.equals(user.getContactNumber())
                && userRepository.existsByContactNumber(contactNumber))
        {
            log.warn("profile update refused for {}: contact number {} is already in use",
                    userId, contactNumber);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Contact number already in use");
        }

        log.info("updating profile of {}: name \"{}\" -> \"{}\", contact {} -> {}",
                userId, user.getName(), request.name().trim(), user.getContactNumber(), contactNumber);

        user.setName(request.name().trim());
        user.setContactNumber(contactNumber);
        return userRepository.save(user);
    }

    @Override
    public boolean verify(String identifier, String otp)
    {
        Optional<User> match = userRepository.findByIdentifier(identifier).filter(user -> !user.isVerified());
        if (match.isEmpty())
        {
            log.warn("verify failed for {}: no unverified account on that identifier", identifier);
            return false;
        }
        User user = match.get();

        // No live code: never issued, already used, expired, or burned by too many guesses.
        // All four mean the same thing to the caller — ask for a new code. They do not mean the
        // same thing to whoever is looking into it, so they are told apart here.
        if (user.getVerificationToken() == null || user.getVerificationTokenExpiry() == null)
        {
            log.warn("verify failed for {}: no code on file (never issued, or already used)", identifier);
            return false;
        }
        if (user.getVerificationTokenExpiry().isBefore(Instant.now()))
        {
            log.warn("verify failed for {}: code expired at {}", identifier, user.getVerificationTokenExpiry());
            return false;
        }
        if (user.getVerificationAttempts() >= MAX_OTP_ATTEMPTS)
        {
            log.warn("verify failed for {}: code burned after {} wrong guesses",
                    identifier, user.getVerificationAttempts());
            return false;
        }

        if (!user.getVerificationToken().equals(otp))
        {
            user.setVerificationAttempts(user.getVerificationAttempts() + 1);
            log.warn("verify failed for {}: wrong code, attempt {} of {}",
                    identifier, user.getVerificationAttempts(), MAX_OTP_ATTEMPTS);
            if (user.getVerificationAttempts() >= MAX_OTP_ATTEMPTS)
            {
                user.setVerificationToken(null);
                user.setVerificationTokenExpiry(null);
            }
            return false;
        }

        log.info("verified account {} ({})", user.getId(), identifier);

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
        // The caller is answered 204 whether or not anything was sent — deliberately, so a
        // stranger cannot probe for accounts — which is also why "my code never arrived" can
        // only ever be answered from here.
        Optional<User> match = userRepository.findByIdentifier(identifier);
        if (match.isEmpty())
        {
            log.warn("resend suppressed for {}: no account on that identifier", identifier);
            return;
        }

        User user = match.get();
        if (user.isVerified())
        {
            log.warn("resend suppressed for {}: already verified", identifier);
            return;
        }
        if (!cooledDown(user.getVerificationTokenExpiry()))
        {
            log.warn("resend suppressed for {}: still inside the {}s cooldown",
                    identifier, RESEND_COOLDOWN.toSeconds());
            return;
        }

        log.info("issuing a fresh verification code for {}", identifier);
        issueVerificationCode(user);
        sendVerificationEmail(user);
    }

    @Override
    public void requestPasswordReset(String email)
    {
        // Suppressed silently, and so logged, for the same reason as resendVerification.
        Optional<User> match = userRepository.findByEmailIgnoreCase(email)
                .filter(user -> user.getEmail() != null && !user.getEmail().isBlank());
        if (match.isEmpty())
        {
            log.warn("reset suppressed for {}: no account with a usable address", email);
            return;
        }

        User user = match.get();
        // An INVITED placeholder has no password to reset — letting one through would
        // hand the shop access waiting on that address to whoever asked for the code.
        if (user.getStatus() != UserStatus.ACTIVE)
        {
            log.warn("reset suppressed for {}: the account is {}, not ACTIVE", email, user.getStatus());
            return;
        }
        if (!cooledDown(user.getResetTokenExpiry()))
        {
            log.warn("reset suppressed for {}: still inside the {}s cooldown",
                    email, RESEND_COOLDOWN.toSeconds());
            return;
        }

        log.info("issuing a password reset code for {}", email);
        user.setResetToken(sixDigitCode());
        user.setResetTokenExpiry(Instant.now().plus(OTP_TTL));
        user.setResetAttempts(0);
        passwordResetEmailService.sendEmail(user.getEmail(), user.getName(), user.getResetToken());
    }

    @Override
    public boolean verifyResetOtp(String email, String otp)
    {
        // Deliberately does not consume the code: the user still has to set a password,
        // and that call re-checks it.
        return liveResetCodeHolder(email, otp).isPresent();
    }

    @Override
    public boolean resetPassword(String email, String otp, String newPassword)
    {
        return liveResetCodeHolder(email, otp)
                .map(user -> {
                    user.setPasswordHash(passwordEncoder.encode(newPassword));
                    user.setResetToken(null);
                    user.setResetTokenExpiry(null);
                    user.setResetAttempts(0);
                    // The reset is also the unlock: it's the only way back in once an account
                    // has been locked out by too many wrong passwords.
                    user.setFailedLoginAttempts(0);
                    user.setLastFailedCredentialHash(null);
                    log.info("password reset completed for {} (account {}) — lockout cleared",
                            email, user.getId());
                    return true;
                })
                .orElse(false);
    }

    /**
     * The single place a reset code is judged, so the check step and the set-password step
     * can never disagree. Empty means "ask for a new code" whatever the reason. A wrong guess
     * is counted here, and burns the code once it hits the cap.
     */
    private Optional<User> liveResetCodeHolder(String email, String otp)
    {
        Optional<User> match = userRepository.findByEmailIgnoreCase(email);
        if (match.isEmpty())
        {
            log.warn("reset code rejected for {}: no account on that address", email);
            return Optional.empty();
        }
        User user = match.get();

        if (user.getResetToken() == null || user.getResetTokenExpiry() == null)
        {
            log.warn("reset code rejected for {}: no code on file (never issued, or already used)", email);
            return Optional.empty();
        }
        if (user.getResetTokenExpiry().isBefore(Instant.now()))
        {
            log.warn("reset code rejected for {}: expired at {}", email, user.getResetTokenExpiry());
            return Optional.empty();
        }
        if (user.getResetAttempts() >= MAX_OTP_ATTEMPTS)
        {
            log.warn("reset code rejected for {}: burned after {} wrong guesses",
                    email, user.getResetAttempts());
            return Optional.empty();
        }

        if (!user.getResetToken().equals(otp))
        {
            user.setResetAttempts(user.getResetAttempts() + 1);
            log.warn("reset code rejected for {}: wrong code, attempt {} of {}",
                    email, user.getResetAttempts(), MAX_OTP_ATTEMPTS);
            if (user.getResetAttempts() >= MAX_OTP_ATTEMPTS)
            {
                user.setResetToken(null);
                user.setResetTokenExpiry(null);
            }
            return Optional.empty();
        }

        return match;
    }

    /**
     * Whether a new code may be mailed, given the expiry of the one already on file. A code is
     * issued at {@code expiry − OTP_TTL}, so the cooldown is measured from there; no expiry at
     * all (never issued, or already used) means nothing to wait for. The caller is answered the
     * same either way — a suppressed send must not tell them an account exists.
     */
    private static boolean cooledDown(Instant currentCodeExpiry)
    {
        return currentCodeExpiry == null
                || currentCodeExpiry.minus(OTP_TTL).plus(RESEND_COOLDOWN).isBefore(Instant.now());
    }

    private static String normalizeEmail(String email)
    {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static String sixDigitCode()
    {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    /** Replaces any existing code with a fresh one, clearing the previous guess count. */
    private static void issueVerificationCode(User user)
    {
        user.setVerificationToken(sixDigitCode());
        user.setVerificationTokenExpiry(Instant.now().plus(OTP_TTL));
        user.setVerificationAttempts(0);
    }

    private void sendVerificationEmail(User user)
    {
        if (user.getEmail() == null || user.getEmail().isBlank())
        {
            log.warn("no verification email sent for account {}: no address on file", user.getId());
            return;
        }
        verificationEmailService.sendEmail(user.getEmail(), user.getName(), user.getVerificationToken());
    }
}
