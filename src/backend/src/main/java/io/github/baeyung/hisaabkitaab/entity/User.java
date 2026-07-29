package io.github.baeyung.hisaabkitaab.entity;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false, unique = true)
    private String contactNumber;

    @JsonIgnore
    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String name;

    private String email;

    // DB default lets ddl-auto=update add this NOT NULL column to a table that already
    // has rows (Postgres rejects adding a NOT NULL column with no default otherwise).
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean verified = false;

    /**
     * Set by an admin to shut the account out — see the {@code admin} package. Checked before
     * the password on every request (Basic auth re-authenticates each time), so it takes effect
     * immediately and everywhere, and the user is told {@code ACCOUNT_DISABLED} at login.
     * Stored as "disabled", not "enabled", so the column defaults to false like the other flags
     * here — {@code ddl-auto=update} cannot add a NOT NULL column to a populated table otherwise.
     */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean disabled = false;

    /** Single-use 6-digit code emailed at signup; nulled once the account verifies. */
    @JsonIgnore
    private String verificationToken;

    /** When {@link #verificationToken} stops working. A code is only good for a short window. */
    @JsonIgnore
    private Instant verificationTokenExpiry;

    /**
     * Wrong codes entered against the current {@link #verificationToken}. A 6-digit code is
     * only 1M combinations, so the code is burned once this hits the cap and the user has to
     * request a fresh one. Reset every time a new code is issued.
     */
    @JsonIgnore
    @Builder.Default
    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int verificationAttempts = 0;

    /**
     * Consecutive wrong passwords at login. At the cap the account is locked — there is no
     * separate flag, the count *is* the lock. Cleared by a successful login or a password
     * reset, the latter being the only way out once locked.
     */
    @JsonIgnore
    @Builder.Default
    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int failedLoginAttempts = 0;

    /**
     * Fingerprint of the most recent wrong password, so repeating the same one doesn't
     * accumulate — see {@code LoginAttemptListener}. Not the password itself: a SHA-256 over
     * the attempt salted with this row's bcrypt hash, which never leaves the database.
     */
    @JsonIgnore
    private String lastFailedCredentialHash;

    /** Single-use 6-digit code emailed for password reset; nulled once the password is reset. */
    @JsonIgnore
    private String resetToken;

    /** When {@link #resetToken} stops working. A reset code is only good for a short window. */
    @JsonIgnore
    private Instant resetTokenExpiry;

    /**
     * Wrong codes entered against the current {@link #resetToken}. Same guard as
     * {@link #verificationAttempts}: the code is burned at the cap and the user has to
     * request a fresh one. Reset every time a new code is issued.
     */
    @JsonIgnore
    @Builder.Default
    @Column(nullable = false, columnDefinition = "integer not null default 0")
    private int resetAttempts = 0;
}
