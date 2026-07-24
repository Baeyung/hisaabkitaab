package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.entity.User;

public interface UserService
{
    User create(SignupRequest request);

    /** Flips the account matching {@code token} to verified. Returns false if no account matches. */
    boolean verify(String token);

    /**
     * Regenerates the token and re-sends the verification email for the account whose
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
