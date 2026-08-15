package io.github.baeyung.hisaabkitaab.entity;

import java.math.BigDecimal;

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
 * One rate this shop taught us: {@code 1 fromUnit = factor toUnit}.
 *
 * <p>Stock is kept in the unit named on the catalogue item, and every quantity that reaches the
 * backend is already in it — the entry screens convert before they post. This table is only
 * what they convert <em>with</em>, and only the part of it that cannot be known in advance: a
 * than is however many metres that mill winds, a bori however many kilos that supplier fills.
 * The fixed rates (metre/gaz, kilo/gram, dozen/piece) are a table in the frontend, the same in
 * every shop; a row here overrides them, for a shop that measures its own way.
 *
 * <p>One row per unordered pair. A rate is symmetric, so the two directions are one fact and
 * are stored as one: {@code fromUnit} is always the alphabetically first of the pair, and a
 * caller asking the other way round gets {@code 1 / factor}. Storing both directions would
 * only give them somewhere to contradict each other.
 *
 * <p>Both units are held folded — trimmed and lower-cased — so "Meter", "meter" and " METER "
 * are one unit and the unique constraint means what it says. Nothing displays these strings:
 * the case a shopkeeper reads always comes from the catalogue item.
 */
@Entity
@Table(name = "unit_conversions",
        uniqueConstraints = @UniqueConstraint(columnNames = {"store_id", "from_unit", "to_unit"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UnitConversion
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(name = "from_unit", nullable = false, length = 64)
    private String fromUnit;

    @Column(name = "to_unit", nullable = false, length = 64)
    private String toUnit;

    /** How many {@code toUnit} one {@code fromUnit} makes. Always positive — see the migration. */
    @Column(nullable = false, precision = 19, scale = 8)
    private BigDecimal factor;
}
