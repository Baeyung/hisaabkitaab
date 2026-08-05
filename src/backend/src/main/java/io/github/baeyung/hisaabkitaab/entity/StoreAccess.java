package io.github.baeyung.hisaabkitaab.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;

import io.github.baeyung.hisaabkitaab.enums.StoreRole;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One user's access to a store they do not own — the whole of multi-user support.
 *
 * <p>The owner is deliberately absent from this table: their rights come from
 * {@code stores.owner_user_id}, so there is exactly one place a store's owner is recorded
 * and no way for the two to disagree. A row here therefore always means "someone else",
 * and its {@link #role} is only ever {@code VIEWER} or {@code EDITOR}.
 */
@Entity
@Table(
        name = "user_access_store",
        uniqueConstraints = @UniqueConstraint(
                name = "user_access_store_store_user_key",
                columnNames = {"store_id", "user_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StoreAccess
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StoreRole role;
}
