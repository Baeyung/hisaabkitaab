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
 * A configurable spend head an expense can be filed under (parts, bijli, salaries…).
 * Per-store, so each shopkeeper tailors their own list; every new store is seeded
 * with a default set (see {@link io.github.baeyung.hisaabkitaab.service.ExpenseCategoryService}).
 * The expense's CASH line points here via FK, so the khata can total outgoings by head.
 *
 * <p>Was an enum until customers wanted their own heads; the six seed names are kept
 * as stable tokens so their bilingual labels still resolve on the frontend, while
 * anything a shopkeeper types is stored and shown as-is.
 */
@Entity
@Table(name = "expense_categories",
        uniqueConstraints = @UniqueConstraint(columnNames = {"store_id", "name"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExpenseCategory
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @Column(nullable = false)
    private String name;
}
