package io.github.baeyung.hisaabkitaab.entity;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.CreationTimestamp;

import io.github.baeyung.hisaabkitaab.enums.TransactionEvent;
import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Transaction
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionEvent event;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "party_id")
    private Party party;

    private String bill;

    private LocalDate eventDate;

    private LocalDate entryDate;

    private String description;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "transaction", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<TransactionLine> lines = new ArrayList<>();

    /**
     * How long after booking an entry a non-owner may still delete it. A rolling window
     * rather than "today", so an entry typed at 11:58pm can still be taken back at midnight.
     * Measured on {@link #createdAt}, not {@code entryDate} or {@code eventDate}, since
     * those are typed into the form and would otherwise reopen the window at will.
     */
    public static final Duration DELETE_WINDOW = Duration.ofHours(24);

    /** Whether this entry is still inside {@link #DELETE_WINDOW}. */
    public boolean isRecent()
    {
        return createdAt != null && createdAt.isAfter(Instant.now().minus(DELETE_WINDOW));
    }
}
