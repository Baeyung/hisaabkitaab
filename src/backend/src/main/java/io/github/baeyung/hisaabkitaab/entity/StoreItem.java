package io.github.baeyung.hisaabkitaab.entity;

import java.math.BigDecimal;

import org.hibernate.annotations.BatchSize;

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
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Batched at the class level, so it covers the proxy as well as any collection of one: a
 * statement or movement row names its item ({@code line.getItem().getName()}), and one shop's
 * history walks hundreds of distinct items. Resolving them a proxy at a time is a round trip
 * per item for a string.
 */
@Entity
@BatchSize(size = 100)
@Table(name = "store_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StoreItem
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @NotBlank
    @Column(nullable = false)
    private String name;

    private String unit;

    private BigDecimal salePrice;

    private BigDecimal costPrice;

    /**
     * Work sold rather than goods — a dry-clean, a stitching job. Nothing leaves a
     * shelf when it is given, so it carries no stock: its lines still record what was
     * sold and for how much, but the inventory screens show no on-hand quantity
     * instead of a number that only ever counts down.
     */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean service;
}
