package io.github.baeyung.hisaabkitaab.admin;

import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One lock or unlock, appended when an admin changes an account's access. Nothing ever
 * updates or deletes a row here — {@code users.disabled} is the current state, this table is
 * how it got there, and it is what the admin panel shows under a user's access history.
 */
@Entity
@Table(name = "account_access_events")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class AccountAccessEvent
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String userId;

    /** The state the account was put *into*: true = locked out. */
    @Column(nullable = false)
    private boolean disabled;

    /** Email of the admin who did it. */
    @Column(nullable = false)
    private String actor;

    /** Optional note the admin typed. Never shown to the user, only in the admin panel. */
    private String reason;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    AccountAccessEvent(String userId, boolean disabled, String actor, String reason)
    {
        this.userId = userId;
        this.disabled = disabled;
        this.actor = actor;
        this.reason = reason;
    }
}
