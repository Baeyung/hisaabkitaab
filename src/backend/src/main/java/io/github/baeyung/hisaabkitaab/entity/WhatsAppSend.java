package io.github.baeyung.hisaabkitaab.entity;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;

import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendSource;
import io.github.baeyung.hisaabkitaab.enums.WhatsAppSendStatus;
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
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One document addressed to one person on WhatsApp: who sent it, who it was for, what was
 * attached, and whether it got there. Written for every recipient of a send, including the
 * ones nothing was attempted for — see {@code V7__whatsapp_sends.sql}.
 *
 * <p>Names and numbers are copied in rather than read back through an id: an audit row has to
 * still make sense after the party is renamed or deleted, so {@link #targetId} and
 * {@link #senderId} are there to join on when the rows are still around, and the snapshot is
 * there for when they are not.
 */
@Entity
@Table(name = "whatsapp_sends")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WhatsAppSend
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    /** Whoever pressed send — not necessarily the owner, whose quota paid for it. */
    @Column(name = "sender_id", nullable = false)
    private String senderId;

    @Column(name = "sender_name", nullable = false)
    private String senderName;

    /** The party or user it was addressed to; a party id or a user id, as in {@code WhatsAppBlock}. */
    @Column(name = "target_id", nullable = false)
    private String targetId;

    @Column(name = "recipient_name", nullable = false)
    private String recipientName;

    /** The number it was going to, as it stood at the time. */
    @Column(nullable = false)
    private String contact;

    /** The name of the attached PDF — "bill.pdf", "khata-rehman.pdf". */
    @Column(nullable = false)
    private String filename;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private WhatsAppSendStatus status;

    /**
     * Why it was sent — a shopkeeper's button, or one of the two scheduled jobs. Also what
     * the scheduler reads to know it has already run; see {@code WhatsAppSendRepository}.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private WhatsAppSendSource source;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;
}
