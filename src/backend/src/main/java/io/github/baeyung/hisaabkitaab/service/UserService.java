package io.github.baeyung.hisaabkitaab.service;

import io.github.baeyung.hisaabkitaab.dto.auth.SignupRequest;
import io.github.baeyung.hisaabkitaab.dto.user.ProfileRequest;
import io.github.baeyung.hisaabkitaab.entity.User;

public interface UserService
{
    User create(SignupRequest request);

    /**
     * Changes the account's own name and contact number. Everyone edits themselves — there is
     * no path here for one user to edit another, including a shop owner editing someone they
     * shared with. Rejects (409) a contact number another account already holds, since it
     * doubles as a login identifier.
     */
    User updateProfile(String userId, ProfileRequest request);

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
     * Issues a 6-digit reset code and emails it to the account matching {@code email}.
     * Silently no-ops when no account has that email, so callers can't probe for existence.
     */
    void requestPasswordReset(String email);

    /**
     * Checks the reset code without consuming it, so the caller can show the new-password
     * screen only once the code is known good. A wrong guess counts against the code's
     * attempt cap exactly as it does on {@link #resetPassword}.
     */
    boolean verifyResetOtp(String email, String otp);

    /**
     * Sets a new password for the account matching {@code email} against its live reset code,
     * then invalidates the code. Returns false when the code is wrong, expired, or burned by
     * too many wrong guesses — the remedy is the same in every case: request a new code.
     */
    boolean resetPassword(String email, String otp, String newPassword);
}
