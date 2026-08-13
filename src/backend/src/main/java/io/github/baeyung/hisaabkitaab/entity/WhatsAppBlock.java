package io.github.baeyung.hisaabkitaab.entity;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * One person's "stop sending me this shop's documents on WhatsApp", written when they confirm
 * it on the opt-out page the template's button opens.
 *
 * <p>The row is keyed by number as well as recipient, which is what makes a block survive a
 * number change without following the recipient onto a new phone: a party given a different
 * contact is reachable again, and given the blocked one back is not. See
 * {@code V6__whatsapp_blocks.sql} for the whole of that reasoning.
 *
 * <p>{@link #targetId} is a party id or a user id — both receive the same template — and holds
 * no foreign key for that reason. Nothing here is ever deleted by the app; support undoes a
 * block from the back office.
 */
@Entity
@Table(
        name = "whatsapp_blocks",
        uniqueConstraints = @UniqueConstraint(
                name = "whatsapp_blocks_store_target_contact_key",
                columnNames = {"store_id", "target_id", "contact"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WhatsAppBlock
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    /** The party or user the block was made for. */
    @Column(name = "target_id", nullable = false)
    private String targetId;

    /** The number that was being messaged when they said stop. */
    @Column(nullable = false)
    private String contact;

    @Column(name = "blocked_at", nullable = false)
    private Instant blockedAt;
}
