package io.github.baeyung.hisaabkitaab.entity;

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
 * A unit name this shop counts stock in — metre, gaz, than, bori. Per-store, so each
 * shopkeeper's own trade units sit beside the standard measures; every new store is seeded
 * with a default set (see {@link io.github.baeyung.hisaabkitaab.service.UnitService}).
 *
 * <p>This is only the name offered on entry screens. It carries no rate: the fixed measures'
 * factors are a table in the frontend (core/units/units.ts), the same in every shop, and a
 * shop's own trade-unit rates live in {@link UnitConversion}. A name can exist here with no
 * conversion at all — a shop that stocks and sells everything in "carton" never needs one.
 */
@Entity
@Table(name = "units",
        uniqueConstraints = @UniqueConstraint(columnNames = {"store_id", "name"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Unit
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(nullable = false, length = 64)
    private String name;
}
