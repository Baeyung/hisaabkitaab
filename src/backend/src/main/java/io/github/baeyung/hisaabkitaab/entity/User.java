package io.github.baeyung.hisaabkitaab.entity;

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

    /** Single-use random token emailed at signup; nulled once the account verifies. */
    @JsonIgnore
    private String verificationToken;
}
