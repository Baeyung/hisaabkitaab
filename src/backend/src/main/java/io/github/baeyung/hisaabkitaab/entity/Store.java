package io.github.baeyung.hisaabkitaab.entity;

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
}
