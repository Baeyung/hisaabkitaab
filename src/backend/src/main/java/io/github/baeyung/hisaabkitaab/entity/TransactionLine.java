package io.github.baeyung.hisaabkitaab.entity;

import io.github.baeyung.hisaabkitaab.converters.CustomFieldValuesConverter;
import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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

import java.math.BigDecimal;
import java.util.Map;

@Entity
@Table(name = "transaction_lines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TransactionLine
{
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "transaction_id", nullable = false)
    private Transaction transaction;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TargetKind targetKind;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "party_id")
    private Party party;

    @ManyToOne(fetch = FetchType.LAZY)
    private StoreItem item;

    /**
     * What this line names when no {@link #item} does — the raw material on a PROCESSING
     * entry, which is deliberately not a catalogue item (see V5__processing.sql). Null
     * everywhere else, where the item's own name serves.
     */
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InOut inOut;

    /** Set only on an EXPENSE cash line (see CashProcessor); null on every other line. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_category_id")
    private ExpenseCategory expenseCategory;

//    @Column(columnDefinition = "TEXT")
//    @Convert(converter = ValueMetaDataConverter.class)
    private Double value;

    private BigDecimal quantity;

    private String unit;

    private Double itemSoldAt;

    /**
     * What this shop's own entry columns held on this line — {@code {"thans": 3, "gazana":
     * 21, "rate": 100}} — for a shop that has configured them in Store Settings › Custom
     * Fields. Null on every line of every shop that has not, and on the cash and party legs
     * of every entry, which have no columns of their own.
     *
     * <p>Carried, never read. {@link #quantity} and {@link #itemSoldAt} stay the only numbers
     * this side computes with: the entry screen derives them from its own formulas so that
     * {@code quantity × itemSoldAt} is exactly the line total the shopkeeper agreed to, which
     * is what keeps {@code DocumentTotals.goods()} agreeing with the screen that wrote it.
     *
     * <p>A null is not a missing value, it is the default two columns — the client reads it
     * back as {@code {quantity, rate}} off the two fields above, because the default field
     * ids are the client's vocabulary in the same way {@code nav.ledger} is. See
     * V14__transaction_line_custom_fields.sql.
     */
    @Column(columnDefinition = "text")
    @Convert(converter = CustomFieldValuesConverter.class)
    private Map<String, BigDecimal> customFields;
}
