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
@Table(name = "parties")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Party
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id",nullable = false)
    private Store store;

    @NotBlank
    @Column(nullable = false)
    private String name;

    @Pattern(regexp = "(\\d{7,15})?")
    private String contact;

    private String address;
}
