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
}
