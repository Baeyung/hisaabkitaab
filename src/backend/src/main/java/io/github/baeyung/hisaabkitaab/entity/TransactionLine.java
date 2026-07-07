package io.github.baeyung.hisaabkitaab.entity;

import java.math.BigDecimal;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import io.github.baeyung.hisaabkitaab.enums.InOut;
import io.github.baeyung.hisaabkitaab.enums.TargetKind;
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
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

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
    @JoinColumn(nullable = false)
    private Transaction transaction;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TargetKind targetKind;

    @ManyToOne(fetch = FetchType.LAZY)
    private Party party;

    @ManyToOne(fetch = FetchType.LAZY)
    private StoreItem item;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InOut inOut;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> valueMetaData;

    private BigDecimal quantity;

    private String unit;
}
