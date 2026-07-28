package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.entity.User;

public interface UserService
{
    User create(SignupRequest request);

    /**
     * Flips the unverified account whose contact number or email matches {@code identifier} to
     * verified, if {@code otp} is its live verification code. Returns false when there is no such
     * account or the code is wrong, expired, or already burned by too many wrong guesses — the
     * caller's remedy is the same in every case: request a new code.
     */
    boolean verify(String identifier, String otp);

    /**
     * Issues a fresh code and re-sends the verification email for the account whose
     * contact number or email matches {@code identifier}. Silently no-ops when there is no
     * matching unverified account, so callers can't probe for account existence.
     */
    void resendVerification(String identifier);

    /**
     * Generates a reset token and emails a reset link to the account matching {@code email}.
     * Silently no-ops when no account has that email, so callers can't probe for existence.
     */
    void requestPasswordReset(String email);

    /**
     * Sets a new password for the account matching a non-expired {@code token}, then invalidates
     * the token. Returns false if the token is unknown or expired.
     */
    boolean resetPassword(String token, String newPassword);
}
