package io.github.baeyung.hisaabkitaab.entity;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

@Entity
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

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false)
    private Store store;

    @Column(nullable = false)
    private String name;

    /** Unit of measure, e.g. meter / than / pc. */
    private String unit;

    /** Prefilled sale price. */
    private BigDecimal salePrice;

    /** Prefilled cost price. */
    private BigDecimal costPrice;
}
