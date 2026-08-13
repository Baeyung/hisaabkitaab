package io.github.baeyung.hisaabkitaab.entity;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;

import io.github.baeyung.hisaabkitaab.converters.StoreSettingsConverter;
import io.github.baeyung.hisaabkitaab.models.StoreSettings;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "stores")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Store
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_user_id", nullable = false)
    private User owner;

    @NotBlank
    @Column(nullable = false)
    private String name;

    private String address;

    /** Optional phone number: blank, or digits only. */
    @Pattern(regexp = "(\\d{7,15})?")
    private String contact;

    // Stored as a base64 data URI for now (see docs/tickets/HK-store-media-object-storage.md);
    // needs `text`, not the default varchar(255), to hold an inlined image.
    @Column(columnDefinition = "text")
    private String logoUri;

    @Column(columnDefinition = "text")
    private String watermarkUri;

    /**
     * How this shop's owner has arranged the app for everyone working in it — menu order,
     * what is shown, what it is called. Null until they have arranged anything, which is
     * the built-in menu; see {@link StoreSettings} for why the contents mean nothing here.
     *
     * <p>{@code @JsonIgnore} because this entity is only ever deserialised — it is the
     * request body of create and update, and neither of those is where a menu is arranged.
     * That is {@code PUT /api/stores/{id}/settings}, whose body is a {@link StoreSettings}
     * and which is validated as one. Responses are always a {@code StoreSummary}, which
     * carries the settings out.
     */
    @JsonIgnore
    @Convert(converter = StoreSettingsConverter.class)
    @Column(columnDefinition = "text")
    private StoreSettings settings;

    /**
     * When the owner's plan stopped covering this shop, or null while it does. A suspended
     * shop is read-only, not gone: it is still listed, readable and printable, and raising
     * the plan's limits opens it again. Set only by {@code PlanService}, which is also the
     * only thing that clears it.
     *
     * <p>Shops with a date here are out of every plan count, so closing one is what an owner
     * over their ceiling does instead of deleting a book they may still need.
     */
    @JsonIgnore
    private Instant suspendedAt;

    /** Whether the plan has this shop closed. The single reading of {@link #suspendedAt}. */
    public boolean isSuspended()
    {
        return suspendedAt != null;
    }

    /**
     * Whether this store is {@code userId}'s own, as opposed to one shared with them. Reads
     * the owner's id off the lazy proxy, which needs no query. The single definition of
     * ownership — everything that treats owners differently asks here.
     */
    public boolean isOwnedBy(String userId)
    {
        return owner != null && owner.getId().equals(userId);
    }
}
